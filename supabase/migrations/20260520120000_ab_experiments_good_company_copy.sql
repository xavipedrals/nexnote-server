-- Onboarding A/B: control = vague social proof; variant_b = specific counts on Good company screen.
update public.ab_experiments
set
    variants = '[
        {
            "id": "control",
            "weight": 50,
            "config": {
                "includes_rate_app": false,
                "good_company_specific_counts": false
            }
        },
        {
            "id": "variant_b",
            "weight": 50,
            "config": {
                "includes_rate_app": true,
                "good_company_specific_counts": true
            }
        }
    ]'::jsonb,
    updated_at = now()
where key = 'onboarding';
