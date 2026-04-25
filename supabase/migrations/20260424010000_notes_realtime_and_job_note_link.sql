-- Async summary generation:
--   * The iOS client now creates the `notes` row up front with
--     `summary_status = 'processing'` and a placeholder title, then invokes
--     `summarize-transcript` in fire-and-forget mode. The function writes the
--     generated title / icon / markdown back onto the note when it's done and
--     flips `summary_status` to `ready` (or `failed`).
--   * `summary_jobs` keeps its own markdown/title/icon for observability and
--     cost tracking, but we need `note_id` to know which note to update.

alter table public.summary_jobs
    add column note_id uuid references public.notes(id) on delete cascade;

create index if not exists summary_jobs_note_id_idx
    on public.summary_jobs(note_id);

-- Enable Realtime on `notes` so the notes list can flip a row from
-- "processing" to "ready" the moment the edge function finishes, without
-- polling.
alter publication supabase_realtime add table public.notes;
