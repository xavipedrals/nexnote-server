-- note_reports: abuse / DMCA / content reports submitted from the public
-- shared-note web view (/s/<token>) and the iOS share sheet's "Report" link.
-- The form is publicly accessible (no auth), so writes go through the
-- `submit-report` edge function using the service role key. No RLS write
-- policy means clients can never insert directly with the publishable key.

create type public.note_report_reason as enum (
    'copyright',
    'harmful',
    'inappropriate',
    'privacy',
    'spam',
    'other'
);

create table if not exists public.note_reports (
    id              uuid primary key default uuidv7(),
    note_id         uuid not null references public.notes(id) on delete cascade,
    -- Snapshot of the share token the reporter clicked through, so we can
    -- correlate reports with revoked / expired links during investigation.
    share_token     text,
    reason          public.note_report_reason not null,
    description     text,
    -- Optional contact channel for follow-up. Reporters can submit anonymously.
    reporter_email  text,
    reporter_name   text,
    user_agent      text,
    created_at      timestamptz not null default now()
);

create index if not exists note_reports_note_id_idx
    on public.note_reports(note_id);
create index if not exists note_reports_created_at_idx
    on public.note_reports(created_at desc);

alter table public.note_reports enable row level security;
-- Intentionally no policies: only the edge function (service role) writes
-- and reads this table. Operators triage via the Supabase SQL editor.
