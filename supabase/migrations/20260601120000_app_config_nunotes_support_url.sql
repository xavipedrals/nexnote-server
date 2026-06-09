-- Point in-app support URL at the NuNotes Cloudflare Pages project.
update public.app_config
set
    value = 'https://nunotes.pages.dev/',
    updated_at = now()
where key = 'support_url';
