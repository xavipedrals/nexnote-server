-- get_exam_card_states: bulk fetch of FSRS snapshots for all cards in
-- an exam. The iOS forecaster needs every card's progress state at once
-- to forward-simulate retrievability through to exam_date — a per-card
-- query would be O(N) round trips for an O(1) reading layout (one row
-- per card from a single table join).
--
-- Returns one row per flashcard in `exam_card_set(p_exam_id)`. Cards
-- without a flashcard_progress row (never reviewed) come back with all
-- progress columns null; the client treats those as fresh `.new` cards.
--
-- Suspended cards are excluded — they don't count toward exam readiness
-- because the user has marked them out-of-rotation. Mirrors the same
-- filter applied in get_study_queue.
--
-- security invoker: relies on the exam_card_set resolver and downstream
-- table RLS to gate access. The user can only read snapshots for their
-- own exams' cards.

create or replace function get_exam_card_states(p_exam_id uuid)
returns table (
    card_id          uuid,
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
    select
        cs.flashcard_id as card_id,
        p.state,
        p.stability,
        p.difficulty,
        p.due_at,
        p.last_reviewed_at,
        p.elapsed_days,
        p.scheduled_days,
        p.step,
        p.reps,
        p.lapses
    from exam_card_set(p_exam_id) cs
    left join flashcard_progress p
           on p.flashcard_id = cs.flashcard_id
          and p.user_id      = auth.uid()
    where coalesce(p.is_suspended, false) = false
$$;

grant execute on function get_exam_card_states(uuid) to authenticated;

-- Companion: rolling N-day Again-rate from flashcard_reviews. The
-- forecaster uses a 7-day window to seed the simulated lapse probability.
-- Cheap aggregate over (user_id, reviewed_at DESC) — already covered by
-- the existing flashcard_reviews_user_id_reviewed_at_idx index.
--
-- Returns 0.0 when the user has fewer than `p_min_reviews` total reviews
-- in the window; the client falls back to a 15/70/15 prior in that case.

create or replace function get_recent_again_rate(
    p_window_days int default 7,
    p_min_reviews int default 10
) returns double precision
language sql
security invoker
stable
as $$
    with recent as (
        select rating
        from flashcard_reviews
        where user_id     = auth.uid()
          and reviewed_at >= now() - make_interval(days => greatest(1, p_window_days))
    ),
    counts as (
        select
            count(*)::int                              as total,
            count(*) filter (where rating = 'again')   as agains
        from recent
    )
    select case
        when total < p_min_reviews then 0.0
        else agains::double precision / total
    end
    from counts;
$$;

grant execute on function get_recent_again_rate(int, int) to authenticated;
