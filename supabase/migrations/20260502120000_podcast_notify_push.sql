-- Podcast: opt-in APNs when generation reaches ready (set from iOS; worker sends push).
alter table public.podcasts
    add column if not exists notify_when_ready boolean not null default false;

comment on column public.podcasts.notify_when_ready is
    'When true, Cloud Run worker sends an APNs alert after status becomes ready.';

-- One row per (user, device token); worker reads with service role.
create table if not exists public.user_push_devices (
    id uuid not null default public.uuidv7() primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    device_token text not null,
    updated_at timestamptz not null default now(),
    constraint user_push_devices_token_len check (char_length(device_token) between 32 and 256),
    constraint user_push_devices_user_token unique (user_id, device_token)
);

alter table public.user_push_devices owner to postgres;

create index if not exists user_push_devices_user_id_idx
    on public.user_push_devices using btree (user_id);

alter table public.user_push_devices enable row level security;

create policy "user_push_devices select own"
    on public.user_push_devices for select
    using (user_id = (select auth.uid()));

create policy "user_push_devices insert own"
    on public.user_push_devices for insert
    with check (user_id = (select auth.uid()));

create policy "user_push_devices update own"
    on public.user_push_devices for update
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "user_push_devices delete own"
    on public.user_push_devices for delete
    using (user_id = (select auth.uid()));

grant delete, insert, references, select, trigger, truncate, update
    on table public.user_push_devices to anon;
grant delete, insert, references, select, trigger, truncate, update
    on table public.user_push_devices to authenticated;
grant delete, insert, references, select, trigger, truncate, update
    on table public.user_push_devices to service_role;
