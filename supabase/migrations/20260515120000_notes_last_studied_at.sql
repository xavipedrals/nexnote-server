-- Track when the note owner last studied (flashcards, quiz, podcast listen).
-- Used for "Recently studied" sort on the notes list.

alter table public.notes
    add column if not exists last_studied_at timestamptz;

create index if not exists notes_user_id_last_studied_at_idx
    on public.notes (user_id, last_studied_at desc nulls last);

-- Owner-only bump: collaborators studying a shared note must not reorder the owner's list.
create or replace function public.bump_note_last_studied(p_note_id uuid, p_studied_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid := auth.uid();
begin
    if v_user is null then
        raise exception 'not_authenticated';
    end if;

    update public.notes n
    set last_studied_at = greatest(coalesce(n.last_studied_at, '-infinity'::timestamptz), p_studied_at)
    where n.id = p_note_id
      and n.user_id = v_user;
end;
$$;

-- Podcast player calls this after meaningful listen time.
create or replace function public.touch_note_last_studied(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid := auth.uid();
begin
    if v_user is null then
        raise exception 'not_authenticated';
    end if;

    if not public.can_access_note(p_note_id, p_require_study => true) then
        raise exception 'forbidden';
    end if;

    perform public.bump_note_last_studied(p_note_id, now());
end;
$$;

-- Extend record_review to bump the parent note after each rating.
create or replace function public.record_review(
    p_card_id uuid,
    p_rating public.review_rating,
    p_state_after public.card_state,
    p_stability_after double precision,
    p_difficulty_after double precision,
    p_scheduled_days integer,
    p_due_at timestamp with time zone,
    p_step smallint default 0,
    p_state_before public.card_state default null,
    p_stability_before double precision default null,
    p_difficulty_before double precision default null,
    p_elapsed_days integer default null,
    p_review_duration_ms integer default null
) returns void
language plpgsql
as $$
declare
    v_user   uuid        := auth.uid();
    v_now    timestamptz := now();
    v_lapsed boolean     := (p_rating = 'again');
    v_note_id uuid;
begin
    if v_user is null then
        raise exception 'not_authenticated';
    end if;

    insert into flashcard_progress (
        flashcard_id, user_id,
        stability, difficulty, state, step,
        due_at, last_reviewed_at,
        elapsed_days, scheduled_days,
        reps, lapses, last_rating
    ) values (
        p_card_id, v_user,
        p_stability_after, p_difficulty_after, p_state_after, coalesce(p_step, 0),
        p_due_at, v_now,
        coalesce(p_elapsed_days, 0), p_scheduled_days,
        1, case when v_lapsed then 1 else 0 end, p_rating
    )
    on conflict (flashcard_id, user_id) do update set
        stability        = excluded.stability,
        difficulty       = excluded.difficulty,
        state            = excluded.state,
        step             = excluded.step,
        due_at           = excluded.due_at,
        last_reviewed_at = excluded.last_reviewed_at,
        elapsed_days     = excluded.elapsed_days,
        scheduled_days   = excluded.scheduled_days,
        reps             = flashcard_progress.reps + 1,
        lapses           = flashcard_progress.lapses + case when v_lapsed then 1 else 0 end,
        last_rating      = excluded.last_rating;

    insert into flashcard_reviews (
        flashcard_id, user_id, rating,
        state_before, stability_before, difficulty_before, elapsed_days,
        stability_after, difficulty_after, scheduled_days,
        review_duration_ms, reviewed_at
    ) values (
        p_card_id, v_user, p_rating,
        p_state_before, p_stability_before, p_difficulty_before, p_elapsed_days,
        p_stability_after, p_difficulty_after, p_scheduled_days,
        p_review_duration_ms, v_now
    );

    select d.note_id into v_note_id
    from public.flashcards c
    join public.flashcard_decks d on d.id = c.deck_id
    where c.id = p_card_id;

    if v_note_id is not null then
        perform public.bump_note_last_studied(v_note_id, v_now);
    end if;
end;
$$;

create or replace function public.trg_quiz_attempt_bump_note_last_studied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_note_id uuid;
begin
    if new.completed_at is null then
        return new;
    end if;

    select q.note_id into v_note_id
    from public.quizzes q
    where q.id = new.quiz_id;

    if v_note_id is not null then
        perform public.bump_note_last_studied(v_note_id, new.completed_at);
    end if;

    return new;
end;
$$;

drop trigger if exists quiz_attempts_bump_note_last_studied on public.quiz_attempts;

create trigger quiz_attempts_bump_note_last_studied
    after insert on public.quiz_attempts
    for each row
    execute function public.trg_quiz_attempt_bump_note_last_studied();

-- Backfill from existing flashcard reviews and completed quiz attempts (owner's own rows).
with study_events as (
    select d.note_id, r.reviewed_at as studied_at
    from public.flashcard_reviews r
    join public.flashcards c on c.id = r.flashcard_id
    join public.flashcard_decks d on d.id = c.deck_id
    join public.notes n on n.id = d.note_id and n.user_id = r.user_id
    union all
    select q.note_id, a.completed_at as studied_at
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    join public.notes n on n.id = q.note_id and n.user_id = a.user_id
    where a.completed_at is not null
),
per_note as (
    select note_id, max(studied_at) as last_studied_at
    from study_events
    group by note_id
)
update public.notes n
set last_studied_at = greatest(coalesce(n.last_studied_at, '-infinity'::timestamptz), p.last_studied_at)
from per_note p
where n.id = p.note_id;

grant execute on function public.touch_note_last_studied(uuid) to authenticated;
grant execute on function public.bump_note_last_studied(uuid, timestamptz) to authenticated;
