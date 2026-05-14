-- Per-folder UI preference: show compact exam-date prompt vs full explainer card.
alter table public.folders
  add column if not exists exam_date_prompt_collapsed boolean not null default false;

comment on column public.folders.exam_date_prompt_collapsed is
  'When true, the notes list shows the compact exam prompt (Activate exam mode toggle) instead of the full card.';
