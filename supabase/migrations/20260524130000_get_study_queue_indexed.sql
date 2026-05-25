-- Rewrite get_study_queue as deck_id-first indexed bucket queries instead of
-- materializing every card in the deck. New cards use ORDER BY id (v7 ≈ creation
-- order) instead of random().

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
    excluded as (
        select unnest(p_exclude_ids) as id
    ),
    not_excluded as (
        select c.id
        from flashcards c
        where c.deck_id = p_deck_id
          and (
              cardinality(p_exclude_ids) = 0
              or not exists (select 1 from excluded e where e.id = c.id)
          )
    ),

    -- ── Standard mode (p_allow_ahead = false) ─────────────────────────────

    new_quota as (
        select greatest(0, least(p_limit, (p_limit::numeric * p_new_ratio)::int))::int as n
    ),
    due_pick as (
        select
            c.id as card_id, c.front, c.back, c.hint,
            'due'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses
        from flashcards c
        join not_excluded ne on ne.id = c.id
        join flashcard_progress p
          on p.flashcard_id = c.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is not null
          and p.due_at <= now()
        order by p.due_at asc
        limit p_limit
    ),
    new_pick as (
        select
            c.id as card_id, c.front, c.back, c.hint,
            'new'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses
        from flashcards c
        join not_excluded ne on ne.id = c.id
        left join flashcard_progress p
          on p.flashcard_id = c.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is null
        order by c.id asc
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
    new_extra as (
        select
            c.id as card_id, c.front, c.back, c.hint,
            'new'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses
        from flashcards c
        join not_excluded ne on ne.id = c.id
        left join flashcard_progress p
          on p.flashcard_id = c.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is null
          and c.id not in (select card_id from new_pick)
        order by c.id asc
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
    ahead_pick_standard as (
        select
            c.id as card_id, c.front, c.back, c.hint,
            'ahead'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses
        from flashcards c
        join not_excluded ne on ne.id = c.id
        join flashcard_progress p
          on p.flashcard_id = c.id and p.user_id = auth.uid()
        where p_allow_ahead
          and not coalesce(p.is_suspended, false)
          and p.state is not null
          and not (p.due_at <= now())
        order by p.due_at asc nulls last
        limit (select n from ahead_quota)
    ),
    standard_final as (
        select * from combined_with_new
        union all
        select * from ahead_pick_standard
    ),

    -- ── Study-ahead mode (p_allow_ahead = true) ───────────────────────────

    scheduled_pick_ahead as (
        select
            c.id as card_id, c.front, c.back, c.hint,
            case when p.due_at <= now() then 'due' else 'ahead' end::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses
        from flashcards c
        join not_excluded ne on ne.id = c.id
        join flashcard_progress p
          on p.flashcard_id = c.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is not null
        order by p.due_at asc nulls last
        limit p_limit
    ),
    new_pick_ahead as (
        select
            c.id as card_id, c.front, c.back, c.hint,
            'new'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses
        from flashcards c
        join not_excluded ne on ne.id = c.id
        left join flashcard_progress p
          on p.flashcard_id = c.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is null
        order by c.id asc
        limit p_limit
    ),
    ahead_mode_final as (
        select * from scheduled_pick_ahead
        union all
        select * from new_pick_ahead
    ),

    final as (
        select * from ahead_mode_final where p_allow_ahead
        union all
        select * from standard_final where not p_allow_ahead
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

-- Dev-only quota sanity check. Run manually after seeding a deck:
--   select test_get_study_queue_quota_math('<deck_id>');
create or replace function test_get_study_queue_quota_math(p_deck_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
    v_limit int := 20;
    v_count int;
begin
    select count(*) into v_count
    from get_study_queue(p_deck_id, v_limit, 0.3, false, array[]::uuid[]);
    if v_count > v_limit then
        raise exception 'standard queue returned % rows, limit %', v_count, v_limit;
    end if;

    select count(*) into v_count
    from get_study_queue(p_deck_id, v_limit, 0.3, true, array[]::uuid[]);
    if v_count > v_limit * 2 then
        raise exception 'ahead queue returned % rows, max expected %', v_count, v_limit * 2;
    end if;

    raise notice 'get_study_queue quota checks passed for deck %', p_deck_id;
end;
$$;

grant execute on function test_get_study_queue_quota_math(uuid) to authenticated;
