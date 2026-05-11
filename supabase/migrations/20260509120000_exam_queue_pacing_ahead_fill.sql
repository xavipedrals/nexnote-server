-- Exam study queue: fill batches during learning / maintenance /
-- consolidation when FSRS has nothing strictly due yet.
--
-- The pacing forecaster spreads an abstract "work budget" across calendar
-- days (expectedReviewLoad + new intros). That number is not the same as
-- count(due_at <= now()). Outside the retrievability window the queue RPC
-- previously returned only due + new cards, so users saw a non-zero "study
-- today" target but an empty session when every card was still scheduled
-- ahead. Pad with weakest-first ahead cards up to p_limit — same ordering
-- as the retrievability sweep, gated off during `retrievability` where
-- `retrievability_pick` already owns ahead cards.

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
    due_pick as (
        select * from classified
        where bucket = 'due'
        order by due_at asc
        limit p_limit
    ),
    retrievability_pick as (
        select * from classified
        where bucket = 'ahead'
          and p_period = 'retrievability'
          and v_exam.final_review_enabled
        order by stability asc nulls first, due_at asc
        limit greatest(0, p_limit - (select count(*)::int from due_pick))
    ),
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
    pacing_ahead_pick as (
        select * from classified
        where bucket = 'ahead'
          and p_period <> 'retrievability'::exam_period
        order by stability asc nulls first, due_at asc
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
        select * from pacing_ahead_pick
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
