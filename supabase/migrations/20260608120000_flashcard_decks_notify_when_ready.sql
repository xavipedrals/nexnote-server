-- Flashcard decks: opt-in APNs when generation reaches ready (set from iOS; edge function sends push).

alter table public.flashcard_decks
    add column if not exists notify_when_ready boolean not null default false;

comment on column public.flashcard_decks.notify_when_ready is
    'When true, generate-flashcards sends an APNs alert after status becomes ready.';
