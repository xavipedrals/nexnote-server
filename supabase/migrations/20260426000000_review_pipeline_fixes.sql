-- Fixes two production bugs in the v5 review pipeline.
--
-- BUG #1 — get_study_queue stops early on fresh decks.
-- The original new-card slot was capped at p_new_ratio * p_limit (e.g. 6 of
-- 20 with the defaults). When a deck has only new cards (no flashcard_progress
-- rows yet), due_pick is empty, ahead_pick needs progress to exist, and we'd
-- return only the 6 "new-quota" cards. The client then saw items.count <
-- batchSize, set hasMore=false, and showed "All caught up" — even though
-- ~94 cards remained untouched.
--
-- Fix: after the initial due+new fill, top up remaining slots from new cards
-- (excluding ones already picked) before falling through to ahead-of-schedule.
-- The 30% ratio still governs the mix when there ARE due cards; it just no
-- longer limits the total when due is empty.
--
-- BUG #2 — record_review rejects every first-ever review.
-- Swift's auto-synthesized Encodable uses encodeIfPresent for Optional
-- properties, so passing nil for p_state_before / p_stability_before /
-- p_difficulty_before / p_elapsed_days OMITS those keys from the JSON body.
-- PostgREST then can't resolve the function (signature mismatch) and 404s,
-- so the client's per-card sync silently fails and nothing lands in
-- flashcard_progress / flashcard_reviews.
--
-- Fix: declare the four *_before params with default null so omitted keys
-- are accepted. PostgREST resolves RPCs by parameter NAME, not position, so
-- this requires reordering the signature (Postgres requires that all params
-- after a defaulted one also have defaults). Required post-review params
-- come first; everything optional moves to the end.

-- 1. Recreate get_study_queue with the new-card top-up.

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
    new_extra_quota as (
        select greatest(0, p_limit - (select count(*) from combined))::int as n
    ),
    -- Top up unused slots with more new cards (the 30% ratio still applies
    -- as the FIRST cut, so a deck with both due+new keeps its mix; only when
    -- due_pick is short does this kick in).
    new_extra as (
        select * from classified
        where bucket = 'new'
          and card_id not in (select card_id from new_pick)
        order by random()
        limit (select n from new_extra_quota)
    ),
    combined_with_new as (
        select * from combined
        union all
        select * from new_extra
    ),
    ahead_quota as (
        select greatest(0, p_limit - (select count(*) from combined_with_new))::int as n
    ),
    ahead_pick as (
        select * from classified
        where bucket = 'ahead' and p_allow_ahead
        order by due_at asc
        limit (select n from ahead_quota)
    ),
    final as (
        select * from combined_with_new
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

-- 2. Drop and recreate record_review with default-null on the *_before
-- params. Drop is required because the signature changes (CREATE OR REPLACE
-- can't alter parameter defaults / order).

drop function if exists record_review(
    uuid, review_rating, card_state, double precision, double precision, int,
    card_state, double precision, double precision, int, timestamptz, smallint, int
);

create or replace function record_review(
    -- Required (every call sends these)
    p_card_id            uuid,
    p_rating             review_rating,
    p_state_after        card_state,
    p_stability_after    double precision,
    p_difficulty_after   double precision,
    p_scheduled_days     int,
    p_due_at             timestamptz,
    -- Optional (omitted on first review of a card; sent on subsequent reviews)
    p_step               smallint         default 0,
    p_state_before       card_state       default null,
    p_stability_before   double precision default null,
    p_difficulty_before  double precision default null,
    p_elapsed_days       int              default null,
    p_review_duration_ms int              default null
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
    uuid, review_rating, card_state, double precision, double precision, int, timestamptz,
    smallint, card_state, double precision, double precision, int, int
) to authenticated;
