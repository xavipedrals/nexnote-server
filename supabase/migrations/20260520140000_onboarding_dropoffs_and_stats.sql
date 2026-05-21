-- onboarding_dropoffs: anonymous pre-auth funnel exits (edge function only).
-- onboarding_stats: per-user snapshot after completed onboarding + login (RLS owner).

create table if not exists public.onboarding_dropoffs (
    id                  uuid primary key default uuidv7(),
    install_id          text not null,
    session_id          text not null,
    flow_version        text not null,
    experiment_variant  text,
    dropped_at_step     text not null,
    last_answered_step  text,
    steps_reached       jsonb not null default '[]'::jsonb,
    answers             jsonb not null default '{}'::jsonb,
    app_version         text,
    locale              text,
    created_at          timestamptz not null default now()
);

comment on table public.onboarding_dropoffs is
    'Pre-auth onboarding exits. Written only by record-onboarding-dropoff (service role).';

create unique index if not exists onboarding_dropoffs_session_id_key
    on public.onboarding_dropoffs (session_id);

create index if not exists onboarding_dropoffs_dropped_at_step_idx
    on public.onboarding_dropoffs (dropped_at_step);

create index if not exists onboarding_dropoffs_created_at_idx
    on public.onboarding_dropoffs (created_at desc);

create index if not exists onboarding_dropoffs_install_id_idx
    on public.onboarding_dropoffs (install_id);

alter table public.onboarding_dropoffs enable row level security;
-- Intentionally no policies: only the edge function (service role) writes.

-- ---------------------------------------------------------------------------

create table if not exists public.onboarding_stats (
    user_id             uuid primary key references auth.users (id) on delete cascade,
    flow_version        text not null,
    experiment_variant  text,
    answers             jsonb not null default '{}'::jsonb,
    steps_reached       jsonb not null default '[]'::jsonb,
    completed_at        timestamptz not null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table public.onboarding_stats is
    'Completed onboarding Q&A linked to an authenticated user.';

alter table public.onboarding_stats enable row level security;

create policy "onboarding_stats select own"
    on public.onboarding_stats
    for select
    to authenticated
    using (user_id = auth.uid());

create policy "onboarding_stats insert own"
    on public.onboarding_stats
    for insert
    to authenticated
    with check (user_id = auth.uid());

create policy "onboarding_stats update own"
    on public.onboarding_stats
    for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

grant select, insert, update on table public.onboarding_stats to authenticated;
