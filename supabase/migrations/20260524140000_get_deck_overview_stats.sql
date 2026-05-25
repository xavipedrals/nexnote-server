-- Aggregate deck overview stats server-side (one round trip instead of
-- pulling every progress row + every study session).

create or replace function get_deck_overview_stats(p_deck_id uuid)
returns json
language sql
security invoker
stable
as $$
    select json_build_object(
        'total_cards', (
            select count(*)::int
            from flashcards c
            where c.deck_id = p_deck_id
        ),
        'session_count', (
            select count(*)::int
            from flashcard_study_sessions s
            where s.deck_id = p_deck_id
              and s.user_id = auth.uid()
        ),
        'total_study_secs', (
            select coalesce(sum(s.duration_secs), 0)::int
            from flashcard_study_sessions s
            where s.deck_id = p_deck_id
              and s.user_id = auth.uid()
        ),
        'rating_counts', coalesce((
            select json_object_agg(rating_key, rating_cnt)
            from (
                select p.last_rating::text as rating_key, count(*)::int as rating_cnt
                from flashcard_progress p
                join flashcards c on c.id = p.flashcard_id
                where c.deck_id = p_deck_id
                  and p.user_id = auth.uid()
                  and p.last_rating is not null
                group by p.last_rating
            ) ratings
        ), '{}'::json),
        'state_counts', coalesce((
            select json_object_agg(state_key, state_cnt)
            from (
                select p.state::text as state_key, count(*)::int as state_cnt
                from flashcard_progress p
                join flashcards c on c.id = p.flashcard_id
                where c.deck_id = p_deck_id
                  and p.user_id = auth.uid()
                group by p.state
            ) states
        ), '{}'::json)
    );
$$;

grant execute on function get_deck_overview_stats(uuid) to authenticated;
