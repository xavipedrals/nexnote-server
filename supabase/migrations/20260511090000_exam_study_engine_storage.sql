-- Exam Study Engine storage.
--
-- The iOS app owns the algorithm: card readiness, debt, target smoothing,
-- next-card priority, and same-day repeat decisions are all computed in Swift.
-- This migration adds only persistence/read-write shapes so those Swift
-- outputs survive app restarts and can be analyzed later.

do $$
begin
    create type exam_card_study_state as enum (
        'unseen',
        'learning',
        'weak',
        'fragile',
        'ready',
        'rescue'
    );
exception when duplicate_object then null;
end $$;

do $$
begin
    create type exam_study_mode as enum (
        'normal',
        'hybrid',
        'cram',
        'rescue'
    );
exception when duplicate_object then null;
end $$;

do $$
begin
    create type exam_review_context as enum (
        'normal',
        'exam_initial',
        'immediate_retry',
        'same_session_delayed_recall',
        'same_day_delayed_recall',
        'next_day_recall',
        'hinted_success',
        'unsupported_free_recall',
        'exam_simulation'
    );
exception when duplicate_object then null;
end $$;

create table exam_card_progress (
    id                    uuid primary key default uuidv7(),
    exam_id               uuid not null references exams(id) on delete cascade,
    flashcard_id          uuid not null references flashcards(id) on delete cascade,
    user_id               uuid not null references auth.users(id) on delete cascade,
    exam_state            exam_card_study_state not null default 'unseen',
    readiness             double precision not null default 0
        check (readiness >= 0 and readiness <= 1),
    debt                  double precision not null default 0
        check (debt >= 0),
    priority              double precision not null default 0,
    next_exam_due_at      timestamptz,
    last_exam_reviewed_at timestamptz,
    same_day_reps         int not null default 0
        check (same_day_reps >= 0),
    total_exam_reps       int not null default 0
        check (total_exam_reps >= 0),
    recent_failures       int not null default 0
        check (recent_failures >= 0),
    last_rating           review_rating,
    last_review_context   exam_review_context,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    constraint exam_card_progress_unique unique (exam_id, flashcard_id, user_id)
);

create index exam_card_progress_exam_user_idx
    on exam_card_progress (exam_id, user_id);

create index exam_card_progress_due_priority_idx
    on exam_card_progress (exam_id, user_id, next_exam_due_at, priority desc);

create index exam_card_progress_state_idx
    on exam_card_progress (exam_id, user_id, exam_state);

create trigger t_exam_card_progress_updated
    before update on exam_card_progress
    for each row
    execute function set_updated_at();

alter table exam_card_progress enable row level security;

create policy "exam card progress self select"
    on exam_card_progress for select
    using (user_id = auth.uid());

create policy "exam card progress self insert"
    on exam_card_progress for insert
    with check (user_id = auth.uid());

create policy "exam card progress self update"
    on exam_card_progress for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "exam card progress self delete"
    on exam_card_progress for delete
    using (user_id = auth.uid());

create table exam_sessions (
    id             uuid primary key default uuidv7(),
    exam_id        uuid not null references exams(id) on delete cascade,
    user_id        uuid not null references auth.users(id) on delete cascade,
    started_at     timestamptz not null default now(),
    ended_at       timestamptz,
    duration_secs  int not null default 0 check (duration_secs >= 0),
    cards_reviewed int not null default 0 check (cards_reviewed >= 0),
    mode           exam_study_mode not null default 'normal',
    strategy       text,
    created_at     timestamptz not null default now()
);

create index exam_sessions_exam_user_started_idx
    on exam_sessions (exam_id, user_id, started_at desc);

alter table exam_sessions enable row level security;

create policy "exam sessions self select"
    on exam_sessions for select
    using (user_id = auth.uid());

create policy "exam sessions self insert"
    on exam_sessions for insert
    with check (user_id = auth.uid());

create policy "exam sessions self update"
    on exam_sessions for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "exam sessions self delete"
    on exam_sessions for delete
    using (user_id = auth.uid());

create table exam_daily_progress (
    id                uuid primary key default uuidv7(),
    exam_id           uuid not null references exams(id) on delete cascade,
    user_id           uuid not null references auth.users(id) on delete cascade,
    study_date        date not null,
    raw_target        int not null default 0 check (raw_target >= 0),
    displayed_target  int not null default 0 check (displayed_target >= 0),
    completed_reviews int not null default 0 check (completed_reviews >= 0),
    readiness         double precision not null default 0
        check (readiness >= 0 and readiness <= 1),
    mode              exam_study_mode not null default 'normal',
    forecast_snapshot jsonb not null default '{}'::jsonb,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    constraint exam_daily_progress_unique unique (exam_id, user_id, study_date)
);

create index exam_daily_progress_exam_user_date_idx
    on exam_daily_progress (exam_id, user_id, study_date desc);

create trigger t_exam_daily_progress_updated
    before update on exam_daily_progress
    for each row
    execute function set_updated_at();

alter table exam_daily_progress enable row level security;

create policy "exam daily progress self select"
    on exam_daily_progress for select
    using (user_id = auth.uid());

create policy "exam daily progress self insert"
    on exam_daily_progress for insert
    with check (user_id = auth.uid());

create policy "exam daily progress self update"
    on exam_daily_progress for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "exam daily progress self delete"
    on exam_daily_progress for delete
    using (user_id = auth.uid());

create table exam_forecast_revisions (
    id               uuid primary key default uuidv7(),
    exam_id          uuid not null references exams(id) on delete cascade,
    user_id          uuid not null references auth.users(id) on delete cascade,
    created_at       timestamptz not null default now(),
    source           text not null default 'app',
    raw_today_target int not null default 0 check (raw_today_target >= 0),
    displayed_target int not null default 0 check (displayed_target >= 0),
    readiness        double precision not null default 0
        check (readiness >= 0 and readiness <= 1),
    mode             exam_study_mode not null default 'normal',
    forecast         jsonb not null default '{}'::jsonb
);

create index exam_forecast_revisions_exam_user_created_idx
    on exam_forecast_revisions (exam_id, user_id, created_at desc);

alter table exam_forecast_revisions enable row level security;

create policy "exam forecast revisions self select"
    on exam_forecast_revisions for select
    using (user_id = auth.uid());

create policy "exam forecast revisions self insert"
    on exam_forecast_revisions for insert
    with check (user_id = auth.uid());

create policy "exam forecast revisions self delete"
    on exam_forecast_revisions for delete
    using (user_id = auth.uid());

create table exam_review_events (
    id                 uuid primary key default uuidv7(),
    exam_id            uuid not null references exams(id) on delete cascade,
    flashcard_id       uuid not null references flashcards(id) on delete cascade,
    user_id            uuid not null references auth.users(id) on delete cascade,
    rating             review_rating not null,
    review_context     exam_review_context not null default 'normal',
    exam_state_before  exam_card_study_state,
    exam_state_after   exam_card_study_state not null,
    readiness_before   double precision,
    readiness_after    double precision not null
        check (readiness_after >= 0 and readiness_after <= 1),
    debt_before        double precision,
    debt_after         double precision not null check (debt_after >= 0),
    priority_after     double precision not null default 0,
    review_duration_ms int,
    reviewed_at        timestamptz not null default now()
);

create index exam_review_events_exam_user_reviewed_idx
    on exam_review_events (exam_id, user_id, reviewed_at desc);

create index exam_review_events_card_idx
    on exam_review_events (flashcard_id, user_id, reviewed_at desc);

alter table exam_review_events enable row level security;

create policy "exam review events self select"
    on exam_review_events for select
    using (user_id = auth.uid());

create policy "exam review events self insert"
    on exam_review_events for insert
    with check (user_id = auth.uid());

create policy "exam review events self delete"
    on exam_review_events for delete
    using (user_id = auth.uid());

create or replace function get_exam_engine_cards(p_exam_id uuid)
returns table (
    card_id               uuid,
    deck_id               uuid,
    front                 text,
    back                  text,
    hint                  text,
    state                 card_state,
    stability             double precision,
    difficulty            double precision,
    due_at                timestamptz,
    last_reviewed_at      timestamptz,
    elapsed_days          int,
    scheduled_days        int,
    step                  smallint,
    reps                  int,
    lapses                int,
    exam_state            exam_card_study_state,
    exam_readiness        double precision,
    exam_debt             double precision,
    exam_priority         double precision,
    next_exam_due_at      timestamptz,
    last_exam_reviewed_at timestamptz,
    same_day_reps         int,
    total_exam_reps       int,
    recent_failures       int,
    last_exam_rating      review_rating,
    last_review_context   exam_review_context
)
language sql
security invoker
stable
as $$
    select
        fc.id as card_id,
        fc.deck_id,
        fc.front,
        fc.back,
        fc.hint,
        p.state,
        p.stability,
        p.difficulty,
        p.due_at,
        p.last_reviewed_at,
        p.elapsed_days,
        p.scheduled_days,
        p.step,
        p.reps,
        p.lapses,
        ecp.exam_state,
        ecp.readiness as exam_readiness,
        ecp.debt as exam_debt,
        ecp.priority as exam_priority,
        ecp.next_exam_due_at,
        ecp.last_exam_reviewed_at,
        ecp.same_day_reps,
        ecp.total_exam_reps,
        ecp.recent_failures,
        ecp.last_rating as last_exam_rating,
        ecp.last_review_context
    from exam_card_set(p_exam_id) cs
    join flashcards fc
      on fc.id = cs.flashcard_id
    left join flashcard_progress p
      on p.flashcard_id = fc.id
     and p.user_id = auth.uid()
    left join exam_card_progress ecp
      on ecp.exam_id = p_exam_id
     and ecp.flashcard_id = fc.id
     and ecp.user_id = auth.uid()
    where coalesce(p.is_suspended, false) = false;
$$;

grant execute on function get_exam_engine_cards(uuid) to authenticated;

create or replace function record_exam_review(
    p_exam_id             uuid,
    p_card_id             uuid,
    p_rating              review_rating,
    p_state_after         card_state,
    p_stability_after     double precision,
    p_difficulty_after    double precision,
    p_scheduled_days      int,
    p_due_at              timestamptz,
    p_review_context      exam_review_context,
    p_exam_state_after    exam_card_study_state,
    p_readiness_after     double precision,
    p_debt_after          double precision,
    p_priority_after      double precision,
    p_same_day_reps       int,
    p_recent_failures     int,
    p_step                smallint default 0,
    p_state_before        card_state default null,
    p_stability_before    double precision default null,
    p_difficulty_before   double precision default null,
    p_elapsed_days        int default null,
    p_review_duration_ms  int default null,
    p_next_exam_due_at    timestamptz default null,
    p_exam_state_before   exam_card_study_state default null,
    p_readiness_before    double precision default null,
    p_debt_before         double precision default null,
    p_study_date          date default null
) returns void
language plpgsql
security invoker
as $$
declare
    v_user   uuid        := auth.uid();
    v_now    timestamptz := now();
    v_lapsed boolean     := (p_rating = 'again');
    v_study_date date    := coalesce(p_study_date, current_date);
begin
    if v_user is null then
        raise exception 'not_authenticated';
    end if;

    if not exists (
        select 1
        from exam_card_set(p_exam_id) cs
        where cs.flashcard_id = p_card_id
    ) then
        raise exception 'card_not_in_exam';
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

    insert into exam_card_progress (
        exam_id, flashcard_id, user_id,
        exam_state, readiness, debt, priority,
        next_exam_due_at, last_exam_reviewed_at,
        same_day_reps, total_exam_reps, recent_failures,
        last_rating, last_review_context
    ) values (
        p_exam_id, p_card_id, v_user,
        p_exam_state_after, p_readiness_after, p_debt_after, p_priority_after,
        p_next_exam_due_at, v_now,
        greatest(0, p_same_day_reps), 1, greatest(0, p_recent_failures),
        p_rating, p_review_context
    )
    on conflict (exam_id, flashcard_id, user_id) do update set
        exam_state            = excluded.exam_state,
        readiness             = excluded.readiness,
        debt                  = excluded.debt,
        priority              = excluded.priority,
        next_exam_due_at      = excluded.next_exam_due_at,
        last_exam_reviewed_at = excluded.last_exam_reviewed_at,
        same_day_reps         = excluded.same_day_reps,
        total_exam_reps       = exam_card_progress.total_exam_reps + 1,
        recent_failures       = excluded.recent_failures,
        last_rating           = excluded.last_rating,
        last_review_context   = excluded.last_review_context;

    insert into exam_review_events (
        exam_id, flashcard_id, user_id, rating, review_context,
        exam_state_before, exam_state_after,
        readiness_before, readiness_after,
        debt_before, debt_after,
        priority_after, review_duration_ms, reviewed_at
    ) values (
        p_exam_id, p_card_id, v_user, p_rating, p_review_context,
        p_exam_state_before, p_exam_state_after,
        p_readiness_before, p_readiness_after,
        p_debt_before, p_debt_after,
        p_priority_after, p_review_duration_ms, v_now
    );

    insert into exam_daily_progress (
        exam_id, user_id, study_date, completed_reviews
    ) values (
        p_exam_id, v_user, v_study_date, 1
    )
    on conflict (exam_id, user_id, study_date) do update set
        completed_reviews = exam_daily_progress.completed_reviews + 1,
        updated_at = v_now;
end;
$$;

grant execute on function record_exam_review(
    uuid, uuid, review_rating, card_state, double precision, double precision,
    int, timestamptz, exam_review_context, exam_card_study_state,
    double precision, double precision, double precision, int, int,
    smallint, card_state, double precision, double precision, int, int,
    timestamptz, exam_card_study_state, double precision, double precision, date
) to authenticated;
