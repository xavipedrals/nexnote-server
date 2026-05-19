-- Swap onboarding A/B defaults: control skips rate-app; variant_b shows it.
update public.ab_experiments
set
    variants = '[
        {"id": "control", "weight": 50, "config": {"includes_rate_app": false}},
        {"id": "variant_b", "weight": 50, "config": {"includes_rate_app": true}}
    ]'::jsonb,
    updated_at = now()
where key = 'onboarding';
