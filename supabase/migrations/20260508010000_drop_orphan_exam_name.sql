-- Drop the orphan `name` column on `exams`.
--
-- The column was added directly in Supabase Studio (or via a draft
-- migration that never made it into the repo) and has a `not null`
-- constraint, which means every iOS insert from the simplified
-- scheduler fails with:
--
--   null value in column "name" of relation "exams"
--   violates not-null constraint
--
-- The simplified scheduler doesn't need a per-exam name — the row is
-- keyed by `(user_id, folder_id)` and the folder already carries a
-- user-visible name. `if exists` keeps this idempotent for any
-- environment whose live schema doesn't actually have the column.

alter table exams
    drop column if exists name;
