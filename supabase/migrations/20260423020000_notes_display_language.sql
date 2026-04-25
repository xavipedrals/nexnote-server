-- Replace the translation model.
--
-- Earlier drafts stored translations in a separate `note_translations` cache
-- and view preferences in `note_view_preferences`. We dropped both ideas:
-- translation now *replaces* `notes.ai_summary` in place, and the language
-- code is a single column on `notes` so future flashcard / quiz / podcast
-- generators can trivially read it and prompt the LLM in the same language.
--
-- `drop ... if exists` so this is a no-op on fresh databases that never saw
-- those tables, and cleans them up on dev databases that did.

drop table if exists note_translations cascade;
drop table if exists note_view_preferences cascade;

alter table notes
    add column if not exists display_language_code text;

comment on column notes.display_language_code is
    'ISO 639-1 code for the language ai_summary is currently written in. '
    'Set by translate-summary and read by generate-flashcards / '
    'generate-quiz / generate-podcast so generated content matches.';
