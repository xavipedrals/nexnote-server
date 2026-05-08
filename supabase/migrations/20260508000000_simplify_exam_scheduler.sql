-- Simplify the exam scheduler.
--
-- The Plan-1 / Plan-2 era exposed three RemNote-style "study plans" plus
-- per-day caps as user-facing config. The new UI surface is just two
-- bits: the exam date and a "study on exam day" toggle.
--
-- Everything else the scheduler needs (target_reps, desired_retention,
-- maintenance_retention, final_review_enabled) is **kept on the row** —
-- the UI doesn't expose them, but the data layer carries them so we
-- can:
--   1. Change defaults without migrating existing rows.
--   2. Re-introduce per-exam overrides later without another schema
--      change.
--   3. Keep the server-side queue's per-period retention logic working
--      against real values instead of a hard-coded 0.9.
--
-- The `exam_period` enum is preserved (queue still uses it for
-- prioritization). The `exam_study_plan` enum and the per-day-cap
-- columns go away because no code reads them any more.

-- 1. Two new toggles. `study_on_exam_date` is the only user-facing one;
--    `final_review_enabled` is the positive replacement for the legacy
--    `disable_retrievability_period` flag.

alter table exams
    add column study_on_exam_date  boolean not null default false,
    add column final_review_enabled boolean not null default true;

-- 2. The queue RPC is re-created below; drop it before we rip the
--    columns it still references.

drop function if exists get_exam_study_queue(uuid, int, exam_period, int, uuid[]);

-- 3. Drop the legacy user-facing columns we no longer touch from any
--    code path. We keep `target_reps`, `desired_retention`,
--    `maintenance_retention` — those still flow through the forecaster
--    and the queue RPC, just sourced from the row's defaults instead
--    of UI input.

alter table exams
    drop column if exists study_plan,
    drop column if exists max_cards_per_day,
    drop column if exists max_new_per_day,
    drop column if exists disable_retrievability_period;

-- 4. Drop the now-unused study-plan enum.

drop type if exists exam_study_plan;

-- 5. Re-create get_exam_study_queue against the trimmed schema. The
--    per-period retention logic is the same as before — every value
--    comes off the exam row, so when defaults equal each other (the
--    new "balanced plan" case) the result collapses to 0.9 across
--    all periods, but a future override naturally drives the queue.

create or replace function get_exam_study_queue(
    p_exam_id     uuid,
    p_limit       int          default 20,
    p_period      exam_period  default 'maintenance',
    p_new_count   int          default 6,
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
            -- has the per-day value if it wants more precision.
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
    --    review window. Gated on both the period AND the per-exam
    --    final_review_enabled flag, so disabling the final review
    --    push at row level fully turns off this branch.
    retrievability_pick as (
        select * from classified
        where bucket = 'ahead'
          and p_period = 'retrievability'
          and v_exam.final_review_enabled
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
            when 'ahead' then 1
            when 'new'   then 2
            else              3
        end,
        coalesce(stability, 0) asc,
        due_at asc nulls last,
        card_id;
end;
$$;

grant execute on function get_exam_study_queue(uuid, int, exam_period, int, uuid[])
    to authenticated;
