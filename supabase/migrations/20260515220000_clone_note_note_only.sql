-- Save-to-library should copy the note content only, not flashcards / quizzes /
-- podcasts (or other generated study assets). Sources are kept so the owner can
-- still open PDFs/audio when storage RLS allows the shared paths.

create or replace function public.clone_note(p_note_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_note_id uuid;
begin
  if not can_access_note(p_note_id, p_require_clone => true) then
    raise exception 'not permitted';
  end if;

  insert into notes (
    user_id, folder_id, title, icon, raw_transcript, ai_summary,
    summary_status, word_count, page_count, display_language_code
  )
  select
    auth.uid(), null, title, icon, raw_transcript, ai_summary,
    summary_status, word_count, page_count, display_language_code
  from notes where id = p_note_id
  returning id into new_note_id;

  insert into note_sources (
    note_id, user_id, kind, status, display_name, sort_order,
    storage_path, source_url, mime_type, file_size_bytes,
    extracted_text, page_count, duration_secs
  )
  select
    new_note_id, auth.uid(), kind, status, display_name, sort_order,
    storage_path, source_url, mime_type, file_size_bytes,
    extracted_text, page_count, duration_secs
  from note_sources where note_id = p_note_id;

  return new_note_id;
end;
$$;
