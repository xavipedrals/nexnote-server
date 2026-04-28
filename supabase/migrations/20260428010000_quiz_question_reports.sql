-- Quiz question reports.
--
-- When a learner spots a problem with a quiz question (wrong answer marked as
-- correct, ambiguous wording, inappropriate content, etc.) they can flag it
-- from the study screen. Reports go straight into a moderation queue —
-- they're never surfaced back to the reporting user, so the only RLS the
-- client needs is "insert your own".
--
-- Inserted directly from iOS (publishable key + RLS) per CLAUDE.md §1.1 —
-- this is a single low-cost row, no LLM, no rate limit, no secret needed.

-- ---------------------------------------------------------------------------
-- 1. Enum (kept in sync with iOS `QuizQuestionReportReason`)
-- ---------------------------------------------------------------------------
do $$ begin
    create type quiz_question_report_reason as enum (
        'incorrect',
        'misleading',
        'inappropriate',
        'duplicate',
        'unclear',
        'other'
    );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_question_reports (
    id          uuid primary key default uuidv7(),
    question_id uuid not null references public.quiz_questions(id) on delete cascade,
    user_id     uuid not null references auth.users(id) on delete cascade,
    reason      quiz_question_report_reason not null,
    report_text text,
    created_at  timestamptz not null default now()
);

create index if not exists quiz_question_reports_question_idx
    on public.quiz_question_reports(question_id);

create index if not exists quiz_question_reports_user_idx
    on public.quiz_question_reports(user_id);

-- A user may flag the same question multiple times if they have new feedback,
-- but the common case is one report per (question, user). No unique
-- constraint — duplicates are cheap and useful signal for moderation.

-- ---------------------------------------------------------------------------
-- 3. RLS — insert/read your own only. Moderation tooling uses the
--    service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.quiz_question_reports enable row level security;

drop policy if exists "quiz_question_reports insert self" on public.quiz_question_reports;
create policy "quiz_question_reports insert self"
    on public.quiz_question_reports for insert
    with check (user_id = auth.uid());

drop policy if exists "quiz_question_reports read self" on public.quiz_question_reports;
create policy "quiz_question_reports read self"
    on public.quiz_question_reports for select
    using (user_id = auth.uid());
