-- Exam planner: schema, RLS, and folder→cards resolver.
--
-- Folder-scoped exam scheduler that wraps the existing FSRS-5 pipeline
-- (record_review + get_study_queue stay untouched). One exam per folder
-- per user — enforced by the unique index — so multiple exams never share
-- cards (each card lives in exactly one folder via note → folder), which
-- removes any need for cross-exam priority weighting in v1.
--
-- The pacing engine and exam-aware queue RPC arrive in follow-up
-- migrations (20260507010000_exam_card_states.sql,
-- 20260507020000_exam_study_queue.sql) so each migration stays focused.

-- 1. Period names (used by the iOS forecaster + the exam queue RPC)
--
--   learning        — fresh new cards being introduced.
--   maintenance     — cards held at a possibly-reduced retention to keep
--                     workload sustainable on long horizons (RemNote's
--                     "with breaks" plan drops to ~0.7 here).
--   consolidation   — last 25% of maintenance, retention ramps back to
--                     the exam-day target.
--   retrievability  — final stretch where every card must surface at
--                     least once regardless of natural due date.

create type exam_period as enum (
    'learning',
    'maintenance',
    'consolidation',
    'retrievability'
);

-- 2. Three RemNote-style study plans. The forecaster picks defaults for
-- maintenance_retention + start_date based on this; users can still
-- override specific advanced parameters on the exam row.

create type exam_study_plan as enum (
    'start_today',
    'start_today_with_breaks',
    'start_later'
);

-- 3. exams: one row per (user, folder). Soft daily target only — the
-- planner never gates the queue on max_cards_per_day, it just shows the
-- forecasted number to the user.

create table exams (
    id                            uuid primary key default uuidv7(),
    user_id                       uuid not null references auth.users(id) on delete cascade,
    folder_id                     uuid not null references folders(id) on delete cascade,
    exam_date                     timestamptz not null,
    start_date                    timestamptz not null default now(),
    study_plan                    exam_study_plan not null default 'start_today',
    target_reps                   int not null default 3
        check (target_reps between 1 and 10),
    desired_retention             double precision not null default 0.9
        check (desired_retention > 0 and desired_retention <= 1),
    -- Retention used during the maintenance period. Defaults to the
    -- desired_retention so "Start today" plans stay flat; the
    -- "with breaks" plan drops this to 0.7 client-side.
    maintenance_retention         double precision not null default 0.9
        check (maintenance_retention > 0 and maintenance_retention <= 1),
    max_cards_per_day             int check (max_cards_per_day is null or max_cards_per_day > 0),
    max_new_per_day               int check (max_new_per_day is null or max_new_per_day > 0),
    disable_retrievability_period boolean not null default false,
    created_at                    timestamptz not null default now(),
    updated_at                    timestamptz not null default now(),
    constraint exams_one_per_folder unique (user_id, folder_id),
    constraint exams_date_after_start check (exam_date > start_date)
);

-- Upcoming-exam lookups: every UI surface that asks "is there an exam
-- for this folder?" filters by user + folder + exam_date.
create index exams_user_folder_idx on exams (user_id, folder_id);
create index exams_user_active_idx on exams (user_id, exam_date);

-- Trigger to keep updated_at fresh on edits. Reuses the existing
-- public.set_updated_at function from the base schema; naming follows
-- the established `t_<table>_updated` pattern.
create trigger t_exams_updated
    before update on exams
    for each row
    execute function set_updated_at();

-- RLS: self-only. Exam configs are personal study plans; even on shared
-- folders, the owner of the folder doesn't get to dictate other users'
-- exams. This matches §1.4 of `Services/Supabase/CLAUDE.md` — same cards
-- can be shared, but progress and study planning stay per-user.
alter table exams enable row level security;

create policy "exams_select_self"
    on exams for select
    using (user_id = auth.uid());

create policy "exams_insert_self"
    on exams for insert
    with check (user_id = auth.uid());

create policy "exams_update_self"
    on exams for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "exams_delete_self"
    on exams for delete
    using (user_id = auth.uid());

-- 4. exam_card_set: resolver that turns an exam row (folder scope) into
-- the set of flashcards under it. Used by both the pacing forecaster and
-- the exam-aware study queue RPC. `security invoker` so the caller's RLS
-- on flashcards/decks/notes applies — no need to re-check ownership here.
--
-- Path: folder → notes → flashcard_decks → flashcards. The existing
-- indexes flashcard_decks_note_id_idx and flashcards_deck_id_idx already
-- cover this join, no new indexes needed.

create or replace function exam_card_set(p_exam_id uuid)
returns table (flashcard_id uuid)
language sql
security invoker
stable
as $$
    select fc.id
    from exams e
    join notes n           on n.folder_id = e.folder_id
    join flashcard_decks d on d.note_id   = n.id
    join flashcards fc     on fc.deck_id  = d.id
    where e.id      = p_exam_id
      and e.user_id = auth.uid();
$$;

grant execute on function exam_card_set(uuid) to authenticated;
