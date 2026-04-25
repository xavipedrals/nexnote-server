-- Flashcard generation infrastructure.
--
-- Adds the columns the `generate-flashcards` edge function needs to track an
-- in-flight generation on the deck itself (no separate jobs table), plus a
-- general-purpose `ai_jobs` row-per-call table that the rate limiter uses.

-- 1. Deck-level generation status.
create type deck_status as enum ('idle', 'generating', 'ready', 'failed');

alter table flashcard_decks
    add column status deck_status not null default 'idle',
    add column is_ai_generated boolean not null default false,
    add column generation_started_at timestamptz,
    add column generation_error text;

-- One AI deck per note. Manual decks stay unconstrained.
create unique index flashcard_decks_one_ai_per_note
    on flashcard_decks(note_id)
    where is_ai_generated;

-- Let the iOS client subscribe to status transitions (generating → ready / failed)
-- and to new card inserts without polling.
alter publication supabase_realtime add table flashcard_decks;
alter publication supabase_realtime add table flashcards;

-- 2. Rate-limit ledger. One row per AI call; the edge function counts rows in
-- the last 24h before spending. Writes happen via service role only.
create table ai_jobs (
    id uuid primary key default uuidv7(),
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null,
    created_at timestamptz not null default now()
);

create index ai_jobs_user_kind_created
    on ai_jobs(user_id, kind, created_at desc);

alter table ai_jobs enable row level security;

create policy "ai_jobs self read"
    on ai_jobs for select
    using (user_id = auth.uid());
