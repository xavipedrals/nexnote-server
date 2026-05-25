-- Low-risk indexes for folder-scoped exam joins, stale processing sweeps,
-- and latest-per-note quiz/podcast lookups.

create index if not exists notes_folder_id_idx
    on notes (folder_id);

create index if not exists notes_user_processing_idx
    on notes (user_id)
    where summary_status = 'processing';

create index if not exists quizzes_note_created_idx
    on quizzes (note_id, created_at desc);

create index if not exists podcasts_note_created_active_idx
    on podcasts (note_id, created_at desc)
    where status <> 'deleted';
