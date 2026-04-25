-- Adds the AI-generated short title and emoji icon to summary_jobs so the
-- client can read them directly off the job row (via Realtime) and write
-- them into the notes row it creates after the summary completes.

alter table public.summary_jobs
    add column title text,
    add column icon text;
