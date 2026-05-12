-- Expose each flashcard's parent note so exam-mode study can open Ask AI
-- (anchored on note transcript) the same way deck-mode study does.

create or replace function get_exam_engine_cards(p_exam_id uuid)
returns table (
    card_id               uuid,
    deck_id               uuid,
    note_id               uuid,
    note_title            text,
    front                 text,
    back                  text,
    hint                  text,
    state                 card_state,
    stability             double precision,
    difficulty            double precision,
    due_at                timestamptz,
    last_reviewed_at      timestamptz,
    elapsed_days          int,
    scheduled_days        int,
    step                  smallint,
    reps                  int,
    lapses                int,
    exam_state            exam_card_study_state,
    exam_readiness        double precision,
    exam_debt             double precision,
    exam_priority         double precision,
    next_exam_due_at      timestamptz,
    last_exam_reviewed_at timestamptz,
    same_day_reps         int,
    total_exam_reps       int,
    recent_failures       int,
    last_exam_rating      review_rating,
    last_review_context   exam_review_context
)
language sql
security invoker
stable
as $$
    select
        fc.id as card_id,
        fc.deck_id,
        fd.note_id,
        coalesce(n.title, ''::text) as note_title,
        fc.front,
        fc.back,
        fc.hint,
        p.state,
        p.stability,
        p.difficulty,
        p.due_at,
        p.last_reviewed_at,
        p.elapsed_days,
        p.scheduled_days,
        p.step,
        p.reps,
        p.lapses,
        ecp.exam_state,
        ecp.readiness as exam_readiness,
        ecp.debt as exam_debt,
        ecp.priority as exam_priority,
        ecp.next_exam_due_at,
        ecp.last_exam_reviewed_at,
        ecp.same_day_reps,
        ecp.total_exam_reps,
        ecp.recent_failures,
        ecp.last_rating as last_exam_rating,
        ecp.last_review_context
    from exam_card_set(p_exam_id) cs
    join flashcards fc
      on fc.id = cs.flashcard_id
    left join flashcard_decks fd
      on fd.id = fc.deck_id
    left join notes n
      on n.id = fd.note_id
    left join flashcard_progress p
      on p.flashcard_id = fc.id
     and p.user_id = auth.uid()
    left join exam_card_progress ecp
      on ecp.exam_id = p_exam_id
     and ecp.flashcard_id = fc.id
     and ecp.user_id = auth.uid()
    where coalesce(p.is_suspended, false) = false;
$$;

grant execute on function get_exam_engine_cards(uuid) to authenticated;
