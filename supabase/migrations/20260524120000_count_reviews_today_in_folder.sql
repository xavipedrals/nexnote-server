-- Replace the 3-hop PostgREST embed used by the iOS exam forecast with a
-- single indexed join scoped to folder + caller.

create or replace function count_reviews_today_in_folder(
    p_folder_id uuid,
    p_since     timestamptz
) returns int
language sql
security invoker
stable
as $$
    select count(*)::int
    from flashcard_reviews r
    join flashcards c on c.id = r.flashcard_id
    join flashcard_decks d on d.id = c.deck_id
    join notes n on n.id = d.note_id
    where r.user_id = auth.uid()
      and n.folder_id = p_folder_id
      and r.reviewed_at >= p_since;
$$;

grant execute on function count_reviews_today_in_folder(uuid, timestamptz) to authenticated;
