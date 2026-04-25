-- Persist the last summarization-failure reason on the note itself, so the
-- detail view can show *why* it failed without joining `summary_jobs`. The
-- jobs table still keeps its own copy for full per-attempt history; this is
-- just the most-recent reason for the row's current state.
--
-- Cleared on retry (back to processing) and on success (ready).

alter table public.notes
    add column summary_error text;
