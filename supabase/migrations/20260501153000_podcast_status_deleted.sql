-- Soft delete for podcasts:
-- keep row + storage file, hide from app flows by status.
alter type public.podcast_status add value if not exists 'deleted';
