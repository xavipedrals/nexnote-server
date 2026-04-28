-- Flashcard review pipeline: atomic record_review() + study queue RPC.
--
-- Replaces the two-write client pattern (upsert progress + insert review log)
-- with a single transactional RPC, and gives the iOS client one call to fetch
-- the next batch of cards to study (due → new → optional ahead-of-schedule).

-- 1. record_review: atomic upsert progress + append review log.
--
-- The iOS client computes new FSRS state on device (swift-fsrs), then calls
-- this with both the pre-review snapshot (for the log) and the post-review
-- state (to update progress and log the result). The server:
--   - asserts auth.uid()
--   - increments reps and lapses based on rating
--   - sets last_reviewed_at / reviewed_at to now()
--   - does both writes in one transaction so a partial failure can't leave
--     a card with updated progress but no review log entry, or vice versa.
--
-- For a card's first review, callers pass nulls for the *_before fields and
-- the on-conflict path doesn't fire — a fresh progress row is inserted.

create or replace function record_review(
    p_card_id            uuid,
    p_rating             review_rating,
    p_state_before       card_state,
    p_stability_before   double precision,
    p_difficulty_before  double precision,
    p_elapsed_days       int,
    p_state_after        card_state,
    p_stability_after    double precision,
    p_difficulty_after   double precision,
    p_scheduled_days     int,
    p_due_at             timestamptz,
    p_step               smallint default 0,
    p_review_duration_ms int default null
) returns void
language plpgsql
security invoker
as $$
declare
    v_user   uuid        := auth.uid();
    v_now    timestamptz := now();
    v_lapsed boolean     := (p_rating = 'again');
begin
    if v_user is null then
        raise exception 'not_authenticated';
    end if;

    insert into flashcard_progress (
        flashcard_id, user_id,
        stability, difficulty, state, step,
        due_at, last_reviewed_at,
        elapsed_days, scheduled_days,
        reps, lapses
    ) values (
        p_card_id, v_user,
        p_stability_after, p_difficulty_after, p_state_after, coalesce(p_step, 0),
        p_due_at, v_now,
        coalesce(p_elapsed_days, 0), p_scheduled_days,
        1, case when v_lapsed then 1 else 0 end
    )
    on conflict (flashcard_id, user_id) do update set
        stability        = excluded.stability,
        difficulty       = excluded.difficulty,
        state            = excluded.state,
        step             = excluded.step,
        due_at           = excluded.due_at,
        last_reviewed_at = excluded.last_reviewed_at,
        elapsed_days     = excluded.elapsed_days,
        scheduled_days   = excluded.scheduled_days,
        reps             = flashcard_progress.reps + 1,
        lapses           = flashcard_progress.lapses + case when v_lapsed then 1 else 0 end;

    insert into flashcard_reviews (
        flashcard_id, user_id, rating,
        state_before, stability_before, difficulty_before, elapsed_days,
        stability_after, difficulty_after, scheduled_days,
        review_duration_ms, reviewed_at
    ) values (
        p_card_id, v_user, p_rating,
        p_state_before, p_stability_before, p_difficulty_before, p_elapsed_days,
        p_stability_after, p_difficulty_after, p_scheduled_days,
        p_review_duration_ms, v_now
    );
end;
$$;

grant execute on function record_review(
    uuid, review_rating, card_state, double precision, double precision, int,
    card_state, double precision, double precision, int, timestamptz, smallint, int
) to authenticated;

-- 2. get_study_queue: returns the next batch of cards to study, with
-- progress state attached so the client can run FSRS without a second query.
--
-- Priority order in the returned set:
--   1. due    — has progress, due_at <= now()
--   2. new    — no progress row yet
--   3. ahead  — has progress, due_at > now() (only if p_allow_ahead)
--
-- The mix of due vs new in a single call is governed by p_new_ratio (e.g.
-- 0.3 = up to 30% of the limit pulled from new cards). Ahead-of-schedule
-- cards top up only when the due+new pool can't fill the limit, so the
-- algorithm's natural pacing is respected unless the user has nothing left
-- to do.
--
-- p_exclude_ids lets callers paginate within a single session: pass the
-- IDs already served and they won't come back. Suspended cards are filtered
-- out unconditionally.
--
-- The bucket column lets the client show a "studying ahead" badge when the
-- user has burned through everything due and is now reviewing early.

create or replace function get_study_queue(
    p_deck_id     uuid,
    p_limit       int     default 20,
    p_new_ratio   numeric default 0.3,
    p_allow_ahead boolean default false,
    p_exclude_ids uuid[]  default array[]::uuid[]
) returns table (
    card_id          uuid,
    front            text,
    back             text,
    hint             text,
    bucket           text,
    state            card_state,
    stability        double precision,
    difficulty       double precision,
    due_at           timestamptz,
    last_reviewed_at timestamptz,
    elapsed_days     int,
    scheduled_days   int,
    step             smallint,
    reps             int,
    lapses           int
)
language sql
security invoker
stable
as $$
    with
    excluded_ids as (
        select unnest(p_exclude_ids) as id
    ),
    deck_cards as (
        select c.id, c.front, c.back, c.hint
        from flashcards c
        where c.deck_id = p_deck_id
          and not exists (select 1 from excluded_ids e where e.id = c.id)
    ),
    enriched as (
        select c.id as card_id, c.front, c.back, c.hint,
               p.state, p.stability, p.difficulty,
               p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
               p.step, p.reps, p.lapses,
               coalesce(p.is_suspended, false) as suspended
        from deck_cards c
        left join flashcard_progress p
               on p.flashcard_id = c.id and p.user_id = auth.uid()
    ),
    classified as (
        select *,
               case
                 when suspended            then 'suspended'
                 when state is null        then 'new'
                 when due_at <= now()      then 'due'
                 else                            'ahead'
               end as bucket
        from enriched
    ),
    new_quota as (
        select greatest(0, least(p_limit, (p_limit::numeric * p_new_ratio)::int))::int as n
    ),
    due_pick as (
        select * from classified
        where bucket = 'due'
        order by due_at asc
        limit p_limit
    ),
    new_pick as (
        select * from classified
        where bucket = 'new'
        order by random()
        limit (select n from new_quota)
    ),
    combined as (
        select * from due_pick
        union all
        select * from new_pick
    ),
    remaining as (
        select greatest(0, p_limit - (select count(*) from combined))::int as n
    ),
    ahead_pick as (
        select * from classified
        where bucket = 'ahead' and p_allow_ahead
        order by due_at asc
        limit (select n from remaining)
    ),
    final as (
        select * from combined
        union all
        select * from ahead_pick
    )
    select card_id, front, back, hint, bucket,
           state, stability, difficulty,
           due_at, last_reviewed_at, elapsed_days, scheduled_days,
           step, reps, lapses
    from final
    order by
        case bucket when 'due' then 0 when 'new' then 1 else 2 end,
        due_at asc nulls last,
        card_id;
$$;

grant execute on function get_study_queue(uuid, int, numeric, boolean, uuid[]) to authenticated;
