-- RLS, Realtime publication, and Storage buckets for podcasts + note_sources.
-- The two tables themselves were created out-of-band; this migration only
-- adds the access controls and infrastructure they need.
--
-- Reads are owner-only for now. When `can_access_note()` is introduced,
-- swap the SELECT policies to call it (see Services/Supabase/CLAUDE.md §1.3).

-- ---------------------------------------------------------------------------
-- podcasts
-- ---------------------------------------------------------------------------
alter table public.podcasts enable row level security;

drop policy if exists "podcasts read self" on public.podcasts;
create policy "podcasts read self"
    on public.podcasts for select
    using (user_id = auth.uid());

drop policy if exists "podcasts insert self" on public.podcasts;
create policy "podcasts insert self"
    on public.podcasts for insert
    with check (user_id = auth.uid());

drop policy if exists "podcasts update self" on public.podcasts;
create policy "podcasts update self"
    on public.podcasts for update
    using (user_id = auth.uid());

drop policy if exists "podcasts delete self" on public.podcasts;
create policy "podcasts delete self"
    on public.podcasts for delete
    using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- note_sources
-- ---------------------------------------------------------------------------
alter table public.note_sources enable row level security;

drop policy if exists "note_sources read self" on public.note_sources;
create policy "note_sources read self"
    on public.note_sources for select
    using (user_id = auth.uid());

drop policy if exists "note_sources insert self" on public.note_sources;
create policy "note_sources insert self"
    on public.note_sources for insert
    with check (user_id = auth.uid());

drop policy if exists "note_sources update self" on public.note_sources;
create policy "note_sources update self"
    on public.note_sources for update
    using (user_id = auth.uid());

drop policy if exists "note_sources delete self" on public.note_sources;
create policy "note_sources delete self"
    on public.note_sources for delete
    using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: clients subscribe to status transitions
-- ---------------------------------------------------------------------------
do $$ begin
    alter publication supabase_realtime add table public.podcasts;
exception when duplicate_object then null;
end $$;

do $$ begin
    alter publication supabase_realtime add table public.note_sources;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
-- `note-sources`: PDFs, audio, images uploaded by the user. Private; access
-- mediated by Storage RLS. The Cloud Run worker uses the service role to
-- download files for transcription.
insert into storage.buckets (id, name, public, file_size_limit)
values ('note-sources', 'note-sources', false, 524288000) -- 500 MB
on conflict (id) do nothing;

-- `podcasts`: generated audio. Private; client gets signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('podcasts', 'podcasts', false, 209715200) -- 200 MB
on conflict (id) do nothing;

-- Storage RLS: user can read/write only objects whose first path segment is
-- their user id (e.g. "<user_id>/<note_id>/<file>"). Service role bypasses.
drop policy if exists "users read own note-sources" on storage.objects;
create policy "users read own note-sources"
    on storage.objects for select
    using (
        bucket_id = 'note-sources'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "users write own note-sources" on storage.objects;
create policy "users write own note-sources"
    on storage.objects for insert
    with check (
        bucket_id = 'note-sources'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "users delete own note-sources" on storage.objects;
create policy "users delete own note-sources"
    on storage.objects for delete
    using (
        bucket_id = 'note-sources'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "users read own podcasts" on storage.objects;
create policy "users read own podcasts"
    on storage.objects for select
    using (
        bucket_id = 'podcasts'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
