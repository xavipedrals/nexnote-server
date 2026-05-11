-- Fix: column reference "state" is ambiguous (PostgreSQL 42702).
--
-- The previous version of get_exam_study_queue (and its predecessors)
-- had a latent bug: the RETURNS TABLE clause declares an OUT parameter
-- `state card_state`, which PL/pgSQL treats as a function variable and
-- brings into scope inside `RETURN QUERY`. The `classified` CTE then
-- referenced `state` unqualified inside its CASE expression, making it
-- ambiguous with the OUT parameter. Default `#variable_conflict` is
-- `error`, so any call would fail with 42702.
--
-- We never noticed because the iOS client overwrote the .failed state
-- with .caughtUp whenever the queue was empty after a fetch error,
-- silently masking the failure as "All caught up".
--
-- Fix: declare `#variable_conflict use_column` at the top of the
-- function body. From now on, any unqualified identifier inside
-- `RETURN QUERY` that matches both a column and a PL/pgSQL variable
-- resolves to the column. The variable can still be referenced
-- explicitly when needed (none of ours need to here).
--
-- Function body otherwise identical to the resilient_fill version
-- (20260509190000): due → forecasted-new → retrievability sweep →
-- pacing fill from new+ahead, with anti-duplication via NOT EXISTS.

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
#variable_conflict use_column
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
                 when suspended              then 'suspended'
                 when enriched.state is null then 'new'
                 when due_at <= now()        then 'due'
                 else                              'ahead'
               end as bucket
        from enriched
        where suspended = false
    ),
    due_pick as (
        select * from classified
        where bucket = 'due'
        order by due_at asc
        limit p_limit
    ),
    retrievability_pick as (
        select * from classified c
        where c.bucket = 'ahead'
          and p_period = 'retrievability'
          and v_exam.final_review_enabled
          and not exists (select 1 from due_pick d where d.card_id = c.card_id)
        order by c.stability asc nulls first, c.due_at asc
        limit greatest(0, p_limit - (select count(*)::int from due_pick))
    ),
    new_pick as (
        select * from classified c
        where c.bucket = 'new'
          and not exists (select 1 from due_pick d where d.card_id = c.card_id)
        order by random()
        limit greatest(0, least(
            p_new_count,
            p_limit - (select count(*)::int from due_pick)
                    - (select count(*)::int from retrievability_pick)
        ))
    ),
    pacing_fill_pick as (
        select * from classified c
        where c.bucket in ('new', 'ahead')
          and p_period <> 'retrievability'::exam_period
          and not exists (select 1 from due_pick d            where d.card_id = c.card_id)
          and not exists (select 1 from new_pick n            where n.card_id = c.card_id)
          and not exists (select 1 from retrievability_pick r where r.card_id = c.card_id)
        order by c.stability asc nulls first, c.due_at asc, c.card_id
        limit greatest(0,
            p_limit
            - (select count(*)::int from due_pick)
            - (select count(*)::int from retrievability_pick)
            - (select count(*)::int from new_pick)
        )
    ),
    final as (
        select * from due_pick
        union all
        select * from retrievability_pick
        union all
        select * from new_pick
        union all
        select * from pacing_fill_pick
    )
    select f.card_id, f.front, f.back, f.hint, f.bucket,
           f.state, f.stability, f.difficulty,
           f.due_at, f.last_reviewed_at, f.elapsed_days, f.scheduled_days,
           f.step, f.reps, f.lapses,
           v_active_retention as active_retention
    from final f
    order by
        case f.bucket
            when 'due'   then 0
            when 'ahead' then 1
            when 'new'   then 2
            else              3
        end,
        coalesce(f.stability, 0) asc,
        f.due_at asc nulls last,
        f.card_id;
end;
$$;

grant execute on function get_exam_study_queue(uuid, int, exam_period, int, uuid[])
    to authenticated;
