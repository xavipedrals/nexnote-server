-- Adds progress_percent (0–100) to podcasts so the Cloud Run worker can
-- report fine-grained progress as TTS synthesizes each script line. iOS
-- subscribes via the existing Realtime publication on `podcasts` and
-- drives a ProgressView from this column.
--
-- Defaults to 0 for existing rows. The worker writes monotonically
-- increasing values; final state (status='ready' or 'failed') sets it to
-- 100 (or leaves it as-is on failure). Bounded with a CHECK so a bad
-- write can't put junk in the column.

alter table public.podcasts
    add column if not exists progress_percent smallint not null default 0;

alter table public.podcasts
    drop constraint if exists podcasts_progress_percent_range;
alter table public.podcasts
    add constraint podcasts_progress_percent_range
    check (progress_percent between 0 and 100);
