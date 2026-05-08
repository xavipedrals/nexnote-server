-- View: flashcards_with_progress
--
-- The flashcards overview / search lists need each card's current FSRS
-- state (`new` / `learning` / `review` / `relearning`) so the row can show
-- a "New" / "Learning" / "Mastered" tag. That information lives in
-- `flashcard_progress`, which is one-to-(at most one) per card-user pair.
--
-- We could either:
--   1. Embed the relation client-side via PostgREST
--      (`select=...,flashcard_progress(state)`) — but that returns a JSON
--      array per row, costs an extra resolution pass in PostgREST, and
--      needs a one-element-array decoder on the client.
--   2. Fire a second query and merge — extra round trip.
--   3. Materialize the join in a view — single flat row per card, single
--      round trip, decodes as a normal record. Pick this one.
--
-- `security_invoker = true` (Postgres 15+) means the underlying tables'
-- RLS policies apply when the view is queried by the user — same access
-- semantics as selecting from the base tables directly. The join is also
-- explicitly filtered to `auth.uid()` so the relationship is obvious to
-- readers and the planner can use the unique index on
-- `(flashcard_id, user_id)` for a single-row point lookup per card.
--
-- The base tables already have the indexes this view's typical access
-- pattern needs (`flashcards(deck_id)` for the outer scan,
-- `flashcard_progress(flashcard_id, user_id)` unique for the join), so no
-- new index is added.

create or replace view public.flashcards_with_progress
with (security_invoker = true) as
select
    c.id,
    c.deck_id,
    c.user_id,
    c.front,
    c.back,
    c.hint,
    p.state          as progress_state,
    p.is_suspended   as is_suspended,
    p.due_at         as due_at,
    p.last_rating    as last_rating
from public.flashcards c
left join public.flashcard_progress p
       on p.flashcard_id = c.id
      and p.user_id = auth.uid();

grant select on public.flashcards_with_progress to authenticated;
