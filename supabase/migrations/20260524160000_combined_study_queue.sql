-- Combined multi-note study queue + per-note flashcard counts for the picker.

-- ── Picker: flashcard counts per note ───────────────────────────────────────

create or replace function get_note_study_summaries(p_note_ids uuid[])
returns table (
    note_id      uuid,
    deck_id      uuid,
    total_cards  int,
    due_count    int,
    new_count    int
)
language sql
security invoker
stable
as $$
    with requested as (
        select unnest(p_note_ids) as note_id
    ),
    ai_decks as (
        select distinct on (d.note_id)
            d.note_id,
            d.id as deck_id
        from flashcard_decks d
        join requested r on r.note_id = d.note_id
        where d.is_ai_generated = true
        order by d.note_id, d.id asc
    ),
    card_stats as (
        select
            ad.note_id,
            ad.deck_id,
            count(c.id)::int as total_cards,
            count(*) filter (
                where p.state is not null
                  and not coalesce(p.is_suspended, false)
                  and p.due_at <= now()
            )::int as due_count,
            count(*) filter (
                where p.state is null
                  and not coalesce(p.is_suspended, false)
            )::int as new_count
        from ai_decks ad
        left join flashcards c on c.deck_id = ad.deck_id
        left join flashcard_progress p
               on p.flashcard_id = c.id and p.user_id = auth.uid()
        group by ad.note_id, ad.deck_id
    )
    select
        r.note_id,
        cs.deck_id,
        coalesce(cs.total_cards, 0) as total_cards,
        coalesce(cs.due_count, 0) as due_count,
        coalesce(cs.new_count, 0) as new_count
    from requested r
    left join card_stats cs on cs.note_id = r.note_id
    where can_access_note(r.note_id, p_require_study => true);
$$;

grant execute on function get_note_study_summaries(uuid[]) to authenticated;

-- ── Study queue across selected notes ───────────────────────────────────────

create or replace function get_combined_study_queue(
    p_note_ids    uuid[],
    p_limit       int     default 20,
    p_new_ratio   numeric default 0.3,
    p_allow_ahead boolean default false,
    p_exclude_ids uuid[]  default array[]::uuid[]
) returns table (
    card_id             uuid,
    front               text,
    back                text,
    hint                text,
    bucket              text,
    state               card_state,
    stability           double precision,
    difficulty          double precision,
    due_at              timestamptz,
    last_reviewed_at    timestamptz,
    elapsed_days        int,
    scheduled_days      int,
    step                smallint,
    reps                int,
    lapses              int,
    deck_id             uuid,
    note_id             uuid,
    note_title          text,
    desired_retention   double precision
)
language sql
security invoker
stable
as $$
    with
    card_pool as (
        select
            c.id,
            c.front,
            c.back,
            c.hint,
            d.id as deck_id,
            n.id as note_id,
            n.title as note_title,
            d.desired_retention
        from flashcards c
        join flashcard_decks d on d.id = c.deck_id
        join notes n on n.id = d.note_id
        where d.note_id = any(p_note_ids)
          and d.is_ai_generated = true
          and can_access_note(n.id, p_require_study => true)
    ),
    excluded as (
        select unnest(p_exclude_ids) as id
    ),
    not_excluded as (
        select cp.*
        from card_pool cp
        where cardinality(p_exclude_ids) = 0
           or not exists (select 1 from excluded e where e.id = cp.id)
    ),

    -- ── Standard mode (p_allow_ahead = false) ─────────────────────────────

    new_quota as (
        select greatest(0, least(p_limit, (p_limit::numeric * p_new_ratio)::int))::int as n
    ),
    due_pick as (
        select
            ne.id as card_id, ne.front, ne.back, ne.hint,
            'due'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses,
            ne.deck_id, ne.note_id, ne.note_title, ne.desired_retention
        from not_excluded ne
        join flashcard_progress p
          on p.flashcard_id = ne.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is not null
          and p.due_at <= now()
        order by p.due_at asc
        limit p_limit
    ),
    new_pick as (
        select
            ne.id as card_id, ne.front, ne.back, ne.hint,
            'new'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses,
            ne.deck_id, ne.note_id, ne.note_title, ne.desired_retention
        from not_excluded ne
        left join flashcard_progress p
          on p.flashcard_id = ne.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is null
        order by ne.id asc
        limit (select n from new_quota)
    ),
    combined as (
        select * from due_pick
        union all
        select * from new_pick
    ),
    new_extra_quota as (
        select greatest(0, p_limit - (select count(*) from combined))::int as n
    ),
    new_extra as (
        select
            ne.id as card_id, ne.front, ne.back, ne.hint,
            'new'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses,
            ne.deck_id, ne.note_id, ne.note_title, ne.desired_retention
        from not_excluded ne
        left join flashcard_progress p
          on p.flashcard_id = ne.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is null
          and ne.id not in (select card_id from new_pick)
        order by ne.id asc
        limit (select n from new_extra_quota)
    ),
    combined_with_new as (
        select * from combined
        union all
        select * from new_extra
    ),
    ahead_quota as (
        select greatest(0, p_limit - (select count(*) from combined_with_new))::int as n
    ),
    ahead_pick_standard as (
        select
            ne.id as card_id, ne.front, ne.back, ne.hint,
            'ahead'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses,
            ne.deck_id, ne.note_id, ne.note_title, ne.desired_retention
        from not_excluded ne
        join flashcard_progress p
          on p.flashcard_id = ne.id and p.user_id = auth.uid()
        where p_allow_ahead
          and not coalesce(p.is_suspended, false)
          and p.state is not null
          and not (p.due_at <= now())
        order by p.due_at asc nulls last
        limit (select n from ahead_quota)
    ),
    standard_final as (
        select * from combined_with_new
        union all
        select * from ahead_pick_standard
    ),

    -- ── Study-ahead mode (p_allow_ahead = true) ───────────────────────────

    scheduled_pick_ahead as (
        select
            ne.id as card_id, ne.front, ne.back, ne.hint,
            case when p.due_at <= now() then 'due' else 'ahead' end::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses,
            ne.deck_id, ne.note_id, ne.note_title, ne.desired_retention
        from not_excluded ne
        join flashcard_progress p
          on p.flashcard_id = ne.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is not null
        order by p.due_at asc nulls last
        limit p_limit
    ),
    new_pick_ahead as (
        select
            ne.id as card_id, ne.front, ne.back, ne.hint,
            'new'::text as bucket,
            p.state, p.stability, p.difficulty,
            p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
            p.step, p.reps, p.lapses,
            ne.deck_id, ne.note_id, ne.note_title, ne.desired_retention
        from not_excluded ne
        left join flashcard_progress p
          on p.flashcard_id = ne.id and p.user_id = auth.uid()
        where not coalesce(p.is_suspended, false)
          and p.state is null
        order by ne.id asc
        limit p_limit
    ),
    ahead_mode_final as (
        select * from scheduled_pick_ahead
        union all
        select * from new_pick_ahead
    ),

    final as (
        select * from ahead_mode_final where p_allow_ahead
        union all
        select * from standard_final where not p_allow_ahead
    )
    select card_id, front, back, hint, bucket,
           state, stability, difficulty,
           due_at, last_reviewed_at, elapsed_days, scheduled_days,
           step, reps, lapses,
           deck_id, note_id, note_title, desired_retention
    from final
    order by
        case bucket when 'due' then 0 when 'new' then 1 else 2 end,
        due_at asc nulls last,
        card_id;
$$;

grant execute on function get_combined_study_queue(uuid[], int, numeric, boolean, uuid[]) to authenticated;

create or replace function test_get_combined_study_queue_quota_math(p_note_ids uuid[])
returns void
language plpgsql
security invoker
as $$
declare
    v_limit int := 20;
    v_count int;
begin
    select count(*) into v_count
    from get_combined_study_queue(p_note_ids, v_limit, 0.3, false, array[]::uuid[]);
    if v_count > v_limit then
        raise exception 'standard combined queue returned % rows, limit %', v_count, v_limit;
    end if;

    select count(*) into v_count
    from get_combined_study_queue(p_note_ids, v_limit, 0.3, true, array[]::uuid[]);
    if v_count > v_limit * 2 then
        raise exception 'ahead combined queue returned % rows, max expected %', v_count, v_limit * 2;
    end if;

    raise notice 'get_combined_study_queue quota checks passed for % notes', cardinality(p_note_ids);
end;
$$;

grant execute on function test_get_combined_study_queue_quota_math(uuid[]) to authenticated;
