-- Save-to-library: clone from a share token without leaving a note_share_link_grants
-- row (which would keep the original note visible in the library with full content).
-- redeem_share_link is for ongoing study access; save-to-library uses this instead.

create or replace function public.clone_shared_note_from_link(p_token text) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link note_share_links%rowtype;
  v_user uuid := auth.uid();
  new_note_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_link
  from note_share_links
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'invalid or expired link';
  end if;

  if not v_link.can_clone then
    raise exception 'not permitted';
  end if;

  insert into notes (
    user_id, folder_id, title, icon, raw_transcript, ai_summary,
    summary_status, word_count, page_count, display_language_code
  )
  select
    v_user, null, title, icon, raw_transcript, ai_summary,
    summary_status, word_count, page_count, display_language_code
  from notes where id = v_link.note_id
  returning id into new_note_id;

  insert into note_sources (
    note_id, user_id, kind, status, display_name, sort_order,
    storage_path, source_url, mime_type, file_size_bytes,
    extracted_text, page_count, duration_secs
  )
  select
    new_note_id, v_user, kind, status, display_name, sort_order,
    storage_path, source_url, mime_type, file_size_bytes,
    extracted_text, page_count, duration_secs
  from note_sources where note_id = v_link.note_id;

  -- Do not keep study access to the sharer's note after saving a private copy.
  delete from note_share_link_grants
  where link_id = v_link.id
    and user_id = v_user;

  update note_share_links
  set use_count = use_count + 1
  where id = v_link.id;

  return new_note_id;
end;
$$;

grant execute on function public.clone_shared_note_from_link(text) to authenticated;
