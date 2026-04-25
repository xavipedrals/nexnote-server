-- Flashcard overview: study time tracking + per-deck rating mode.
--
-- Backs the new flashcards landing screen which shows:
--   - aggregate "grade" derived from flashcard_reviews ratings
--   - mastery split derived from flashcard_progress.state
--   - total study time + session count + average per session
--
-- The grade and mastery numbers come from data we already store. Study time
-- needs a new table because we don't currently record session boundaries.

-- 1. Per-deck rating mode.
--
-- Drives the study-session UI later: `simple` shows two buttons (Bad / Good),
-- `full` shows four (Again / Hard / Good / Easy). The underlying
-- `flashcard_reviews.rating` enum stays at 4 values regardless — simple mode
-- maps Bad → again and Good → good when writing reviews. This keeps the
-- grade math (weighted average over the four ratings) uniform across modes.
create type deck_rating_mode as enum ('simple', 'full');

alter table flashcard_decks
    add column rating_mode deck_rating_mode not null default 'full';

-- 2. Study sessions.
--
-- One row per study session. The client opens a session when the user starts
-- studying and closes it on exit (or after an idle timeout). Aggregating over
-- (deck_id, user_id) gives us total time, session count, and average — all
-- the stats the overview card needs.
--
-- Per-user, per-deck. Sharing a deck means each user accumulates their own
-- independent session history, same pattern as flashcard_progress.
create table flashcard_study_sessions (
    id uuid primary key default uuidv7(),
    deck_id uuid not null references flashcard_decks(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    duration_secs int not null default 0,
    cards_reviewed int not null default 0
);

create index flashcard_study_sessions_deck_user
    on flashcard_study_sessions(deck_id, user_id, started_at desc);

alter table flashcard_study_sessions enable row level security;

create policy "study sessions self select"
    on flashcard_study_sessions for select
    using (user_id = auth.uid());

create policy "study sessions self insert"
    on flashcard_study_sessions for insert
    with check (user_id = auth.uid());

create policy "study sessions self update"
    on flashcard_study_sessions for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "study sessions self delete"
    on flashcard_study_sessions for delete
    using (user_id = auth.uid());
