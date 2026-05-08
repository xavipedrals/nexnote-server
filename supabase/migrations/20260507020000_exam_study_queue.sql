-- get_exam_study_queue: exam-aware variant of get_study_queue.
--
-- Same shape as the deck-mode RPC (cards + their FSRS snapshot in one
-- round trip) but operating over `exam_card_set(p_exam_id)` instead of
-- a single deck_id. Two key behavioural differences:
--
--   1. During the retrievability period, also include cards with
--      `due_at > now()`, ordered by `stability ASC` (weakest-first),
--      so every card surfaces at least once in the final review window.
--   2. Returns one extra column `active_retention double precision` per
--      card; the client passes it into FSRSEngine.next(...desiredRetentionOverride:)
--      so the resulting interval reflects the period's retention target.
--
-- The new-card ratio is replaced by `p_new_count` — an explicit count
-- the client computes from the forecaster's daily plan. This way the
-- server never has to second-guess what the pacing engine decided;
-- client-driven pacing wins over server-side guesswork (Plan 2's call).
--
-- p_period selects the retention target. Callers pass the period from
-- the forecaster's todayPlan; the RPC trusts it (the planner already
-- knows which day this is).

create or replace function get_exam_study_queue(
    p_exam_id     uuid,
    p_limit       int          default 20,
    p_period      exam_period  default 'maintenance',
    p_new_count   int          default 6, -- derived from forecaster's new intros to reach todayQuota
    p_exclude_ids uuid[]       default array[]::uuid[]
) returns table (
    card_id           uuid,
    front             text,
    back              text,
    hint              text,
    bucket            text,
    state             card_state,
    stability         double precision,
    difficulty        double precision,
    due_at            timestamptz,
    last_reviewed_at  timestamptz,
    elapsed_days      int,
    scheduled_days    int,
    step              smallint,
    reps              int,
    lapses            int,
    active_retention  double precision
)
language plpgsql
security invoker
stable
as $$
declare
    v_active_retention double precision;
    v_exam exams%rowtype;
    v_user uuid := auth.uid();
begin
    if v_user is null then
        raise exception 'not_authenticated';
    end if;

    -- Trust RLS via security_invoker, but resolve the row first so we
    -- can pick the right retention target and key off of the exam's
    -- maintenance/desired retentions.
    select * into v_exam from exams where id = p_exam_id and user_id = v_user;
    if not found then
        raise exception 'exam_not_found';
    end if;

    v_active_retention := case p_period
        when 'learning'       then v_exam.desired_retention
        when 'maintenance'    then v_exam.maintenance_retention
        when 'consolidation'  then
            -- Server can't know the precise day-in-consolidation, so
            -- average maintenance + desired. Close enough — the client
            -- has the per-day value if it wants more precision, and
            -- in practice the difference is < 5%.
            (v_exam.maintenance_retention + v_exam.desired_retention) / 2
        when 'retrievability' then v_exam.desired_retention
    end;

    return query
    with
    excluded_ids as (
        select unnest(p_exclude_ids) as id
    ),
    card_pool as (
        select cs.flashcard_id as id
        from exam_card_set(p_exam_id) cs
        where not exists (select 1 from excluded_ids e where e.id = cs.flashcard_id)
    ),
    enriched as (
        select c.id as card_id,
               c.front, c.back, c.hint,
               p.state, p.stability, p.difficulty,
               p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
               p.step, p.reps, p.lapses,
               coalesce(p.is_suspended, false) as suspended
        from card_pool cp
        join flashcards c on c.id = cp.id
        left join flashcard_progress p
               on p.flashcard_id = c.id and p.user_id = v_user
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
        where suspended = false
    ),
    -- 1) Due bucket: any card where the FSRS due_at has passed.
    due_pick as (
        select * from classified
        where bucket = 'due'
        order by due_at asc
        limit p_limit
    ),
    -- 2) Retrievability-period extra: weakest-first ahead-of-schedule
    --    cards force-included so every card surfaces in the final
    --    review window. No-op outside that period.
    retrievability_pick as (
        select * from classified
        where bucket = 'ahead' and p_period = 'retrievability'
        order by stability asc nulls first, due_at asc
        limit greatest(0, p_limit - (select count(*)::int from due_pick))
    ),
    -- 3) New cards: client passes the exact count it wants per the
    --    pacer's schedule.
    new_pick as (
        select * from classified
        where bucket = 'new'
        order by random()
        limit greatest(0, least(
            p_new_count,
            p_limit - (select count(*)::int from due_pick)
                    - (select count(*)::int from retrievability_pick)
        ))
    ),
    final as (
        select * from due_pick
        union all
        select * from retrievability_pick
        union all
        select * from new_pick
    )
    select card_id, front, back, hint, bucket,
           state, stability, difficulty,
           due_at, last_reviewed_at, elapsed_days, scheduled_days,
           step, reps, lapses,
           v_active_retention as active_retention
    from final
    order by
        case bucket
            when 'due'   then 0
            when 'ahead' then 1  -- only present in retrievability period
            when 'new'   then 2
            else              3
        end,
        coalesce(stability, 0) asc,  -- weakest first within the bucket
        due_at asc nulls last,
        card_id;
end;
$$;

grant execute on function get_exam_study_queue(uuid, int, exam_period, int, uuid[])
    to authenticated;
