-- Study-ahead mode: when p_allow_ahead is true, return up to p_limit new cards
-- plus up to p_limit scheduled cards (soonest due_at first — due and future).
-- Sessions can repeat cards across batches; the client only excludes the
-- in-flight pipeline. Normal mode is unchanged when p_allow_ahead is false.

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

    -- ── Standard mode (p_allow_ahead = false) ─────────────────────────────

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
    ahead_pick_standard as (
        select * from classified
        where bucket = 'ahead' and p_allow_ahead
        order by due_at asc
        limit (select n from ahead_quota)
    ),
    standard_final as (
        select * from combined_with_new
        union all
        select * from ahead_pick_standard
    ),

    -- ── Study-ahead mode (p_allow_ahead = true) ───────────────────────────
    -- Up to p_limit scheduled (due + future, soonest due_at) and p_limit new.

    scheduled_pick_ahead as (
        select * from classified
        where bucket in ('due', 'ahead')
        order by due_at asc
        limit p_limit
    ),
    new_pick_ahead as (
        select * from classified
        where bucket = 'new'
        order by random()
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
