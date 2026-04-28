-- Quiz generation infrastructure.
--
-- The `quizzes`, `quiz_questions`, `quiz_attempts`, and `quiz_attempt_answers`
-- tables were created out-of-band with a thinner schema than the iOS app and
-- the `generate-quiz` edge function need. This migration:
--   1. Adds enums (status, difficulty, question_type).
--   2. Adds the missing columns (status/difficulty/kinds/etc on quizzes,
--      type+user_id on quiz_questions, user_id on quiz_attempt_answers).
--   3. Backfills user_id on the child tables from their parents and locks the
--      column to NOT NULL.
--   4. Adds RLS, Realtime publication, and `profiles.is_premium`.
--
-- Idempotent: reruns cleanly even if the schema is already half-migrated.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$ begin
    create type quiz_status as enum ('generating', 'ready', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
    create type quiz_difficulty as enum ('easy', 'medium', 'hard');
exception when duplicate_object then null; end $$;

do $$ begin
    create type quiz_question_type as enum ('multiple_choice', 'true_false');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Extend `quizzes`
-- ---------------------------------------------------------------------------
alter table public.quizzes
    add column if not exists status quiz_status not null default 'generating',
    add column if not exists difficulty quiz_difficulty not null default 'medium',
    add column if not exists is_multiple_choice boolean not null default true,
    add column if not exists is_true_false boolean not null default false,
    add column if not exists requested_count integer not null default 10,
    add column if not exists generation_error text;

-- ---------------------------------------------------------------------------
-- 3. Extend `quiz_questions`: add `type` and denormalized `user_id`.
-- ---------------------------------------------------------------------------
alter table public.quiz_questions
    add column if not exists type quiz_question_type not null default 'multiple_choice',
    add column if not exists user_id uuid;

-- Backfill user_id from the parent quiz row.
update public.quiz_questions q
   set user_id = z.user_id
  from public.quizzes z
 where q.user_id is null
   and q.quiz_id = z.id;

-- Lock down. Safe to re-run: alter column ... set not null is idempotent.
alter table public.quiz_questions
    alter column user_id set not null;

do $$ begin
    alter table public.quiz_questions
        add constraint quiz_questions_user_id_fkey
        foreign key (user_id) references auth.users(id) on delete cascade;
exception when duplicate_object then null; end $$;

create index if not exists quiz_questions_quiz_id_position_idx
    on public.quiz_questions(quiz_id, position);

-- ---------------------------------------------------------------------------
-- 4. Extend `quiz_attempt_answers`: add denormalized `user_id`.
-- ---------------------------------------------------------------------------
alter table public.quiz_attempt_answers
    add column if not exists user_id uuid;

update public.quiz_attempt_answers a
   set user_id = at.user_id
  from public.quiz_attempts at
 where a.user_id is null
   and a.attempt_id = at.id;

alter table public.quiz_attempt_answers
    alter column user_id set not null;

do $$ begin
    alter table public.quiz_attempt_answers
        add constraint quiz_attempt_answers_user_id_fkey
        foreign key (user_id) references auth.users(id) on delete cascade;
exception when duplicate_object then null; end $$;

create index if not exists quiz_attempt_answers_attempt_idx
    on public.quiz_attempt_answers(attempt_id);

-- ---------------------------------------------------------------------------
-- 5. RLS — quizzes (owner only for now; sharing layer can switch to
--    can_access_note(...) when shared notes ship for the quiz feature)
-- ---------------------------------------------------------------------------
alter table public.quizzes enable row level security;

drop policy if exists "quizzes read self" on public.quizzes;
create policy "quizzes read self"
    on public.quizzes for select
    using (user_id = auth.uid());

drop policy if exists "quizzes insert self" on public.quizzes;
create policy "quizzes insert self"
    on public.quizzes for insert
    with check (user_id = auth.uid());

drop policy if exists "quizzes update self" on public.quizzes;
create policy "quizzes update self"
    on public.quizzes for update
    using (user_id = auth.uid());

drop policy if exists "quizzes delete self" on public.quizzes;
create policy "quizzes delete self"
    on public.quizzes for delete
    using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. RLS — quiz_questions
-- ---------------------------------------------------------------------------
alter table public.quiz_questions enable row level security;

drop policy if exists "quiz_questions read self" on public.quiz_questions;
create policy "quiz_questions read self"
    on public.quiz_questions for select
    using (user_id = auth.uid());

drop policy if exists "quiz_questions insert self" on public.quiz_questions;
create policy "quiz_questions insert self"
    on public.quiz_questions for insert
    with check (user_id = auth.uid());

drop policy if exists "quiz_questions delete self" on public.quiz_questions;
create policy "quiz_questions delete self"
    on public.quiz_questions for delete
    using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. RLS — quiz_attempts (private progress)
-- ---------------------------------------------------------------------------
alter table public.quiz_attempts enable row level security;

drop policy if exists "quiz_attempts read self" on public.quiz_attempts;
create policy "quiz_attempts read self"
    on public.quiz_attempts for select
    using (user_id = auth.uid());

drop policy if exists "quiz_attempts insert self" on public.quiz_attempts;
create policy "quiz_attempts insert self"
    on public.quiz_attempts for insert
    with check (user_id = auth.uid());

drop policy if exists "quiz_attempts update self" on public.quiz_attempts;
create policy "quiz_attempts update self"
    on public.quiz_attempts for update
    using (user_id = auth.uid());

drop policy if exists "quiz_attempts delete self" on public.quiz_attempts;
create policy "quiz_attempts delete self"
    on public.quiz_attempts for delete
    using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. RLS — quiz_attempt_answers
-- ---------------------------------------------------------------------------
alter table public.quiz_attempt_answers enable row level security;

drop policy if exists "quiz_attempt_answers read self" on public.quiz_attempt_answers;
create policy "quiz_attempt_answers read self"
    on public.quiz_attempt_answers for select
    using (user_id = auth.uid());

drop policy if exists "quiz_attempt_answers insert self" on public.quiz_attempt_answers;
create policy "quiz_attempt_answers insert self"
    on public.quiz_attempt_answers for insert
    with check (user_id = auth.uid());

drop policy if exists "quiz_attempt_answers delete self" on public.quiz_attempt_answers;
create policy "quiz_attempt_answers delete self"
    on public.quiz_attempt_answers for delete
    using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9. Realtime — quizzes (status flips) + quiz_questions (insert stream)
-- ---------------------------------------------------------------------------
do $$ begin
    alter publication supabase_realtime add table public.quizzes;
exception when duplicate_object then null; end $$;

do $$ begin
    alter publication supabase_realtime add table public.quiz_questions;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 10. profiles.is_premium — drives the rate-limiter bypass for paying users.
-- ---------------------------------------------------------------------------
alter table public.profiles
    add column if not exists is_premium boolean not null default false;
