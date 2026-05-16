-- clone_note copied quiz_questions without user_id (required since quiz_generation
-- migration). Also copy question type and quiz generation metadata.

create or replace function public.clone_note(p_note_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_note_id uuid;
  r_deck      record;
  new_deck_id uuid;
  r_quiz      record;
  new_quiz_id uuid;
begin
  if not can_access_note(p_note_id, p_require_clone => true) then
    raise exception 'not permitted';
  end if;

  insert into notes (user_id, folder_id, title, icon, raw_transcript, ai_summary,
                     summary_status, word_count, page_count)
  select auth.uid(), null, title, icon, raw_transcript, ai_summary,
         summary_status, word_count, page_count
  from notes where id = p_note_id
  returning id into new_note_id;

  insert into note_sources (note_id, user_id, kind, status, display_name, sort_order,
                            storage_path, source_url, mime_type, file_size_bytes,
                            extracted_text, page_count, duration_secs)
  select new_note_id, auth.uid(), kind, status, display_name, sort_order,
         storage_path, source_url, mime_type, file_size_bytes,
         extracted_text, page_count, duration_secs
  from note_sources where note_id = p_note_id;

  for r_deck in select * from flashcard_decks where note_id = p_note_id loop
    insert into flashcard_decks (note_id, user_id, name, desired_retention)
    values (new_note_id, auth.uid(), r_deck.name, r_deck.desired_retention)
    returning id into new_deck_id;

    insert into flashcards (deck_id, user_id, front, back, hint)
    select new_deck_id, auth.uid(), front, back, hint
    from flashcards where deck_id = r_deck.id;
  end loop;

  for r_quiz in select * from quizzes where note_id = p_note_id loop
    insert into quizzes (
      note_id, user_id, title, question_count,
      status, difficulty, is_multiple_choice, is_true_false, requested_count, generation_error
    )
    values (
      new_note_id, auth.uid(), r_quiz.title, r_quiz.question_count,
      r_quiz.status, r_quiz.difficulty, r_quiz.is_multiple_choice, r_quiz.is_true_false,
      r_quiz.requested_count, r_quiz.generation_error
    )
    returning id into new_quiz_id;

    insert into quiz_questions (
      quiz_id, user_id, position, question, explanation, options, correct_option, type
    )
    select
      new_quiz_id, auth.uid(), position, question, explanation, options, correct_option, type
    from quiz_questions where quiz_id = r_quiz.id;
  end loop;

  return new_note_id;
end;
$$;
