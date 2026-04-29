-- Cache the most recent rating on flashcard_progress.
--
-- The flashcards overview screen renders an Easy/Good/Hard/Again histogram
-- bucketed by each card's *latest* rating. Computing that from
-- flashcard_reviews requires scanning every review row for the deck and
-- deduping by flashcard_id — fine at small scale, but the review log grows
-- unbounded (every rating ever given) while the histogram only depends on
-- the latest one. A power-user deck with 500 cards × 50 reviews each would
-- pull 25k rows over the wire on every overview open.
--
-- Adding last_rating to flashcard_progress collapses that to one row per
-- card-user pair (the table is unique on (flashcard_id, user_id)), so the
-- overview query stays bounded by deck size no matter how much study
-- history accumulates.
--
-- Backfill strategy: existing rows get 'hard' via the column default. We
-- intentionally do NOT recompute historical ratings from flashcard_reviews
-- — the grade is a leading indicator of recent performance, and once users
-- review again it self-corrects within a study session or two.

alter table public.flashcard_progress
    add column last_rating public.review_rating not null default 'hard'::review_rating;

-- Recreate record_review to write last_rating on both the insert and the
-- on-conflict update path. Signature is unchanged (p_rating already carries
-- the value we need) so iOS callers don't have to change.

create or replace function record_review(
    -- Required (every call sends these)
    p_card_id            uuid,
    p_rating             review_rating,
    p_state_after        card_state,
    p_stability_after    double precision,
    p_difficulty_after   double precision,
    p_scheduled_days     int,
    p_due_at             timestamptz,
    -- Optional (omitted on first review of a card; sent on subsequent reviews)
    p_step               smallint         default 0,
    p_state_before       card_state       default null,
    p_stability_before   double precision default null,
    p_difficulty_before  double precision default null,
    p_elapsed_days       int              default null,
    p_review_duration_ms int              default null
) returns void
language plpgsql
security invoker
as $$
declare
    v_user   uuid        := auth.uid();
    v_now    timestamptz := now();
    v_lapsed boolean     := (p_rating = 'again');
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
end;
$$;
