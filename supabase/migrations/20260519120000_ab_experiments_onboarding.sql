-- Public A/B experiment definitions (readable before sign-in).
-- Clients fetch variants, assign a sticky variant locally, and read per-variant config.

create table if not exists public.ab_experiments (
    key text not null primary key,
    enabled boolean not null default true,
    variants jsonb not null,
    updated_at timestamptz not null default now(),
    constraint ab_experiments_variants_is_array check (jsonb_typeof(variants) = 'array')
);

comment on table public.ab_experiments is
    'A/B experiment registry. SELECT is public; edits via dashboard / service role only.';

comment on column public.ab_experiments.variants is
    'Array of {"id": string, "weight": int, "config": object}. Weights are relative within the experiment.';

alter table public.ab_experiments owner to postgres;

alter table public.ab_experiments enable row level security;

create policy "ab_experiments select public"
    on public.ab_experiments
    for select
    to anon, authenticated
    using (true);

grant select on table public.ab_experiments to anon;
grant select on table public.ab_experiments to authenticated;

-- Onboarding: control = no rate-app screen (default); variant_b = show rate-app screen.
insert into public.ab_experiments (key, enabled, variants)
values (
    'onboarding',
    true,
    '[
        {"id": "control", "weight": 50, "config": {"includes_rate_app": false}},
        {"id": "variant_b", "weight": 50, "config": {"includes_rate_app": true}}
    ]'::jsonb
)
on conflict (key) do update
set
    enabled = excluded.enabled,
    variants = excluded.variants,
    updated_at = now();
