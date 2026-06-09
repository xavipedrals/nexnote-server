-- Lets authenticated users permanently delete their own auth.users row.
-- ON DELETE CASCADE on user-owned tables removes associated app data.

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null then
        raise exception 'not authenticated';
    end if;

    delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_current_user() from public;
revoke all on function public.delete_current_user() from anon;
grant execute on function public.delete_current_user() to authenticated;
