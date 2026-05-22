-- Remote app configuration (public read). Update values in the Supabase dashboard
-- without shipping a new iOS build.

create table if not exists public.app_config (
    key text not null primary key,
    value text not null,
    updated_at timestamptz not null default now(),
    constraint app_config_key_format check (key ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.app_config is
    'Key-value app settings. SELECT is public; edits via dashboard / service role only.';

alter table public.app_config owner to postgres;

alter table public.app_config enable row level security;

create policy "app_config select public"
    on public.app_config
    for select
    to anon, authenticated
    using (true);

grant select on table public.app_config to anon;
grant select on table public.app_config to authenticated;

insert into public.app_config (key, value)
values ('support_url', 'https://nexnote.pages.dev/')
on conflict (key) do update
set
    value = excluded.value,
    updated_at = now();
