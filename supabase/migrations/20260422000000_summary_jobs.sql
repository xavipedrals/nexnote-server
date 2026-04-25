-- Summary jobs: tracks background AI summarization of transcripts stored in Supabase Storage.

create type summary_job_status as enum ('queued', 'processing', 'complete', 'failed');

create table public.summary_jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,

    -- Source file in Supabase Storage
    bucket text not null,
    path text not null,

    -- Lifecycle
    status summary_job_status not null default 'queued',
    retry_count int not null default 0,
    error text,

    -- Result
    markdown text,

    -- Observability
    model text,
    input_tokens int,
    output_tokens int,
    cost_usd numeric(10, 6),

    -- Timestamps
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz
);

create index summary_jobs_user_id_created_at_idx
    on public.summary_jobs (user_id, created_at desc);

create index summary_jobs_status_idx
    on public.summary_jobs (status)
    where status in ('queued', 'processing');

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger summary_jobs_set_updated_at
    before update on public.summary_jobs
    for each row execute function public.set_updated_at();

-- RLS: users only see and manage their own jobs. The edge function uses the service role and bypasses RLS.
alter table public.summary_jobs enable row level security;

create policy "users read own jobs"
    on public.summary_jobs for select
    using (auth.uid() = user_id);

create policy "users insert own jobs"
    on public.summary_jobs for insert
    with check (auth.uid() = user_id);

create policy "users update own jobs"
    on public.summary_jobs for update
    using (auth.uid() = user_id);

-- Enable Realtime so the iOS client can subscribe to row changes.
alter publication supabase_realtime add table public.summary_jobs;
