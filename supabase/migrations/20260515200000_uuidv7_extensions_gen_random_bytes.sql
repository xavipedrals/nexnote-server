-- uuidv7() calls gen_random_bytes(), which is provided by pgcrypto and on
-- Supabase lives in the `extensions` schema.
--
-- In the SQL editor you often run as a role whose search_path includes
-- `extensions`, so `select uuidv7()` works. PostgREST (iOS / anon / authenticated)
-- typically uses search_path like `$user, public` only — unqualified
-- `gen_random_bytes` then fails with:
--   function gen_random_bytes(integer) does not exist
--
-- Fully qualify so uuidv7 behaves the same for every caller.

create or replace function public.uuidv7() returns uuid
language sql
parallel safe
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          extensions.gen_random_bytes(16)
          placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;
