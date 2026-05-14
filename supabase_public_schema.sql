


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."card_state" AS ENUM (
    'new',
    'learning',
    'review',
    'relearning'
);


ALTER TYPE "public"."card_state" OWNER TO "postgres";


CREATE TYPE "public"."deck_rating_mode" AS ENUM (
    'simple',
    'full'
);


ALTER TYPE "public"."deck_rating_mode" OWNER TO "postgres";


CREATE TYPE "public"."deck_status" AS ENUM (
    'idle',
    'generating',
    'ready',
    'failed'
);


ALTER TYPE "public"."deck_status" OWNER TO "postgres";


CREATE TYPE "public"."exam_period" AS ENUM (
    'learning',
    'maintenance',
    'consolidation',
    'retrievability'
);


ALTER TYPE "public"."exam_period" OWNER TO "postgres";


CREATE TYPE "public"."note_report_reason" AS ENUM (
    'copyright',
    'harmful',
    'inappropriate',
    'privacy',
    'spam',
    'other'
);


ALTER TYPE "public"."note_report_reason" OWNER TO "postgres";


CREATE TYPE "public"."note_status" AS ENUM (
    'draft',
    'processing',
    'ready',
    'failed'
);


ALTER TYPE "public"."note_status" OWNER TO "postgres";


CREATE TYPE "public"."podcast_status" AS ENUM (
    'generating',
    'ready',
    'failed',
    'deleted'
);


ALTER TYPE "public"."podcast_status" OWNER TO "postgres";


CREATE TYPE "public"."quiz_difficulty" AS ENUM (
    'easy',
    'medium',
    'hard'
);


ALTER TYPE "public"."quiz_difficulty" OWNER TO "postgres";


CREATE TYPE "public"."quiz_question_report_reason" AS ENUM (
    'incorrect',
    'misleading',
    'inappropriate',
    'duplicate',
    'unclear',
    'other'
);


ALTER TYPE "public"."quiz_question_report_reason" OWNER TO "postgres";


CREATE TYPE "public"."quiz_question_type" AS ENUM (
    'multiple_choice',
    'true_false'
);


ALTER TYPE "public"."quiz_question_type" OWNER TO "postgres";


CREATE TYPE "public"."quiz_status" AS ENUM (
    'generating',
    'ready',
    'failed'
);


ALTER TYPE "public"."quiz_status" OWNER TO "postgres";


CREATE TYPE "public"."review_rating" AS ENUM (
    'again',
    'hard',
    'good',
    'easy'
);


ALTER TYPE "public"."review_rating" OWNER TO "postgres";


CREATE TYPE "public"."source_kind" AS ENUM (
    'pdf',
    'image',
    'audio',
    'video',
    'youtube',
    'web_url',
    'text',
    'handwritten_scan'
);


ALTER TYPE "public"."source_kind" OWNER TO "postgres";


CREATE TYPE "public"."source_status" AS ENUM (
    'pending',
    'extracting',
    'ready',
    'failed'
);


ALTER TYPE "public"."source_status" OWNER TO "postgres";


CREATE TYPE "public"."summary_job_status" AS ENUM (
    'queued',
    'processing',
    'complete',
    'failed'
);


ALTER TYPE "public"."summary_job_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_note"("p_note_id" "uuid", "p_require_study" boolean DEFAULT false, "p_require_clone" boolean DEFAULT false) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    exists (select 1 from notes where id = p_note_id and user_id = auth.uid())
    or
    exists (
      select 1 from note_shares s
      where s.note_id = p_note_id
        and s.shared_with_id = auth.uid()
        and s.can_view
        and (not p_require_study or s.can_study)
        and (not p_require_clone or s.can_clone)
    )
    or
    exists (
      select 1
      from note_share_link_grants g
      join note_share_links l on l.id = g.link_id
      where l.note_id = p_note_id
        and g.user_id = auth.uid()
        and l.revoked_at is null
        and (l.expires_at is null or l.expires_at > now())
        and l.can_view
        and (not p_require_study or l.can_study)
        and (not p_require_clone or l.can_clone)
    );
$$;


ALTER FUNCTION "public"."can_access_note"("p_note_id" "uuid", "p_require_study" boolean, "p_require_clone" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_note"("p_note_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  new_note_id uuid;
  r_deck      record;
  new_deck_id uuid;
  r_quiz      record;
  new_quiz_id uuid;
begin
  if not can_access_note(p_note_id, p_require_clone => true) then
    raise exception 'not permitted';
  end if;

  insert into notes (user_id, folder_id, title, icon, raw_transcript, ai_summary,
                     summary_status, word_count, page_count)
  select auth.uid(), null, title, icon, raw_transcript, ai_summary,
         summary_status, word_count, page_count
  from notes where id = p_note_id
  returning id into new_note_id;

  insert into note_sources (note_id, user_id, kind, status, display_name, sort_order,
                            storage_path, source_url, mime_type, file_size_bytes,
                            extracted_text, page_count, duration_secs)
  select new_note_id, auth.uid(), kind, status, display_name, sort_order,
         storage_path, source_url, mime_type, file_size_bytes,
         extracted_text, page_count, duration_secs
  from note_sources where note_id = p_note_id;

  for r_deck in select * from flashcard_decks where note_id = p_note_id loop
    insert into flashcard_decks (note_id, user_id, name, desired_retention)
    values (new_note_id, auth.uid(), r_deck.name, r_deck.desired_retention)
    returning id into new_deck_id;

    insert into flashcards (deck_id, user_id, front, back, hint)
    select new_deck_id, auth.uid(), front, back, hint
    from flashcards where deck_id = r_deck.id;
  end loop;

  for r_quiz in select * from quizzes where note_id = p_note_id loop
    insert into quizzes (note_id, user_id, title, question_count)
    values (new_note_id, auth.uid(), r_quiz.title, r_quiz.question_count)
    returning id into new_quiz_id;

    insert into quiz_questions (quiz_id, position, question, explanation, options, correct_option)
    select new_quiz_id, position, question, explanation, options, correct_option
    from quiz_questions where quiz_id = r_quiz.id;
  end loop;

  return new_note_id;
end $$;


ALTER FUNCTION "public"."clone_note"("p_note_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exam_card_set"("p_exam_id" "uuid") RETURNS TABLE("flashcard_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
    select fc.id
    from exams e
    join notes n           on n.folder_id = e.folder_id
    join flashcard_decks d on d.note_id   = n.id
    join flashcards fc     on fc.deck_id  = d.id
    where e.id      = p_exam_id
      and e.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."exam_card_set"("p_exam_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_exam_card_states"("p_exam_id" "uuid") RETURNS TABLE("card_id" "uuid", "state" "public"."card_state", "stability" double precision, "difficulty" double precision, "due_at" timestamp with time zone, "last_reviewed_at" timestamp with time zone, "elapsed_days" integer, "scheduled_days" integer, "step" smallint, "reps" integer, "lapses" integer)
    LANGUAGE "sql" STABLE
    AS $$
    select
        cs.flashcard_id as card_id,
        p.state,
        p.stability,
        p.difficulty,
        p.due_at,
        p.last_reviewed_at,
        p.elapsed_days,
        p.scheduled_days,
        p.step,
        p.reps,
        p.lapses
    from exam_card_set(p_exam_id) cs
    left join flashcard_progress p
           on p.flashcard_id = cs.flashcard_id
          and p.user_id      = auth.uid()
    where coalesce(p.is_suspended, false) = false
$$;


ALTER FUNCTION "public"."get_exam_card_states"("p_exam_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_exam_study_queue"("p_exam_id" "uuid", "p_limit" integer DEFAULT 20, "p_period" "public"."exam_period" DEFAULT 'maintenance'::"public"."exam_period", "p_new_count" integer DEFAULT 6, "p_exclude_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[]) RETURNS TABLE("card_id" "uuid", "front" "text", "back" "text", "hint" "text", "bucket" "text", "state" "public"."card_state", "stability" double precision, "difficulty" double precision, "due_at" timestamp with time zone, "last_reviewed_at" timestamp with time zone, "elapsed_days" integer, "scheduled_days" integer, "step" smallint, "reps" integer, "lapses" integer, "active_retention" double precision)
    LANGUAGE "plpgsql" STABLE
    AS $$
#variable_conflict use_column
declare
    v_active_retention double precision;
    v_exam exams%rowtype;
    v_user uuid := auth.uid();
begin
    if v_user is null then
        raise exception 'not_authenticated';
    end if;

    select * into v_exam from exams where id = p_exam_id and user_id = v_user;
    if not found then
        raise exception 'exam_not_found';
    end if;

    v_active_retention := case p_period
        when 'learning'       then v_exam.desired_retention
        when 'maintenance'    then v_exam.maintenance_retention
        when 'consolidation'  then
            (v_exam.maintenance_retention + v_exam.desired_retention) / 2
        when 'retrievability' then v_exam.desired_retention
    end;

    return query
    with
    excluded_ids as (
        select unnest(p_exclude_ids) as id
    ),
    card_pool as (
        select cs.flashcard_id as id
        from exam_card_set(p_exam_id) cs
        where not exists (select 1 from excluded_ids e where e.id = cs.flashcard_id)
    ),
    enriched as (
        select c.id as card_id,
               c.front, c.back, c.hint,
               p.state, p.stability, p.difficulty,
               p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
               p.step, p.reps, p.lapses,
               coalesce(p.is_suspended, false) as suspended
        from card_pool cp
        join flashcards c on c.id = cp.id
        left join flashcard_progress p
               on p.flashcard_id = c.id and p.user_id = v_user
    ),
    classified as (
        select *,
               case
                 when suspended              then 'suspended'
                 when enriched.state is null then 'new'
                 when due_at <= now()        then 'due'
                 else                              'ahead'
               end as bucket
        from enriched
        where suspended = false
    ),
    due_pick as (
        select * from classified
        where bucket = 'due'
        order by due_at asc
        limit p_limit
    ),
    retrievability_pick as (
        select * from classified c
        where c.bucket = 'ahead'
          and p_period = 'retrievability'
          and v_exam.final_review_enabled
          and not exists (select 1 from due_pick d where d.card_id = c.card_id)
        order by c.stability asc nulls first, c.due_at asc
        limit greatest(0, p_limit - (select count(*)::int from due_pick))
    ),
    new_pick as (
        select * from classified c
        where c.bucket = 'new'
          and not exists (select 1 from due_pick d where d.card_id = c.card_id)
        order by random()
        limit greatest(0, least(
            p_new_count,
            p_limit - (select count(*)::int from due_pick)
                    - (select count(*)::int from retrievability_pick)
        ))
    ),
    pacing_fill_pick as (
        select * from classified c
        where c.bucket in ('new', 'ahead')
          and p_period <> 'retrievability'::exam_period
          and not exists (select 1 from due_pick d            where d.card_id = c.card_id)
          and not exists (select 1 from new_pick n            where n.card_id = c.card_id)
          and not exists (select 1 from retrievability_pick r where r.card_id = c.card_id)
        order by c.stability asc nulls first, c.due_at asc, c.card_id
        limit greatest(0,
            p_limit
            - (select count(*)::int from due_pick)
            - (select count(*)::int from retrievability_pick)
            - (select count(*)::int from new_pick)
        )
    ),
    final as (
        select * from due_pick
        union all
        select * from retrievability_pick
        union all
        select * from new_pick
        union all
        select * from pacing_fill_pick
    )
    select f.card_id, f.front, f.back, f.hint, f.bucket,
           f.state, f.stability, f.difficulty,
           f.due_at, f.last_reviewed_at, f.elapsed_days, f.scheduled_days,
           f.step, f.reps, f.lapses,
           v_active_retention as active_retention
    from final f
    order by
        case f.bucket
            when 'due'   then 0
            when 'ahead' then 1
            when 'new'   then 2
            else              3
        end,
        coalesce(f.stability, 0) asc,
        f.due_at asc nulls last,
        f.card_id;
end;
$$;


ALTER FUNCTION "public"."get_exam_study_queue"("p_exam_id" "uuid", "p_limit" integer, "p_period" "public"."exam_period", "p_new_count" integer, "p_exclude_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_again_rate"("p_window_days" integer DEFAULT 7, "p_min_reviews" integer DEFAULT 10) RETURNS double precision
    LANGUAGE "sql" STABLE
    AS $$
    with recent as (
        select rating
        from flashcard_reviews
        where user_id     = auth.uid()
          and reviewed_at >= now() - make_interval(days => greatest(1, p_window_days))
    ),
    counts as (
        select
            count(*)::int                              as total,
            count(*) filter (where rating = 'again')   as agains
        from recent
    )
    select case
        when total < p_min_reviews then 0.0
        else agains::double precision / total
    end
    from counts;
$$;


ALTER FUNCTION "public"."get_recent_again_rate"("p_window_days" integer, "p_min_reviews" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_study_queue"("p_deck_id" "uuid", "p_limit" integer DEFAULT 20, "p_new_ratio" numeric DEFAULT 0.3, "p_allow_ahead" boolean DEFAULT false, "p_exclude_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[]) RETURNS TABLE("card_id" "uuid", "front" "text", "back" "text", "hint" "text", "bucket" "text", "state" "public"."card_state", "stability" double precision, "difficulty" double precision, "due_at" timestamp with time zone, "last_reviewed_at" timestamp with time zone, "elapsed_days" integer, "scheduled_days" integer, "step" smallint, "reps" integer, "lapses" integer)
    LANGUAGE "sql" STABLE
    AS $$
    with
    excluded_ids as (
        select unnest(p_exclude_ids) as id
    ),
    deck_cards as (
        select c.id, c.front, c.back, c.hint
        from flashcards c
        where c.deck_id = p_deck_id
          and not exists (select 1 from excluded_ids e where e.id = c.id)
    ),
    enriched as (
        select c.id as card_id, c.front, c.back, c.hint,
               p.state, p.stability, p.difficulty,
               p.due_at, p.last_reviewed_at, p.elapsed_days, p.scheduled_days,
               p.step, p.reps, p.lapses,
               coalesce(p.is_suspended, false) as suspended
        from deck_cards c
        left join flashcard_progress p
               on p.flashcard_id = c.id and p.user_id = auth.uid()
    ),
    classified as (
        select *,
               case
                 when suspended            then 'suspended'
                 when state is null        then 'new'
                 when due_at <= now()      then 'due'
                 else                            'ahead'
               end as bucket
        from enriched
    ),
    new_quota as (
        select greatest(0, least(p_limit, (p_limit::numeric * p_new_ratio)::int))::int as n
    ),
    due_pick as (
        select * from classified
        where bucket = 'due'
        order by due_at asc
        limit p_limit
    ),
    new_pick as (
        select * from classified
        where bucket = 'new'
        order by random()
        limit (select n from new_quota)
    ),
    combined as (
        select * from due_pick
        union all
        select * from new_pick
    ),
    new_extra_quota as (
        select greatest(0, p_limit - (select count(*) from combined))::int as n
    ),
    -- Top up unused slots with more new cards (the 30% ratio still applies
    -- as the FIRST cut, so a deck with both due+new keeps its mix; only when
    -- due_pick is short does this kick in).
    new_extra as (
        select * from classified
        where bucket = 'new'
          and card_id not in (select card_id from new_pick)
        order by random()
        limit (select n from new_extra_quota)
    ),
    combined_with_new as (
        select * from combined
        union all
        select * from new_extra
    ),
    ahead_quota as (
        select greatest(0, p_limit - (select count(*) from combined_with_new))::int as n
    ),
    ahead_pick as (
        select * from classified
        where bucket = 'ahead' and p_allow_ahead
        order by due_at asc
        limit (select n from ahead_quota)
    ),
    final as (
        select * from combined_with_new
        union all
        select * from ahead_pick
    )
    select card_id, front, back, hint, bucket,
           state, stability, difficulty,
           due_at, last_reviewed_at, elapsed_days, scheduled_days,
           step, reps, lapses
    from final
    order by
        case bucket when 'due' then 0 when 'new' then 1 else 2 end,
        due_at asc nulls last,
        card_id;
$$;


ALTER FUNCTION "public"."get_study_queue"("p_deck_id" "uuid", "p_limit" integer, "p_new_ratio" numeric, "p_allow_ahead" boolean, "p_exclude_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."uuidv7"() RETURNS "uuid"
    LANGUAGE "sql" PARALLEL SAFE
    AS $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          gen_random_bytes(16)
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


ALTER FUNCTION "public"."uuidv7"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."flashcards" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "deck_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "front" "text" NOT NULL,
    "back" "text" NOT NULL,
    "hint" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."flashcards" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_study_session"("p_deck_id" "uuid", "p_limit" integer DEFAULT 100, "p_new_ratio" numeric DEFAULT 0.3) RETURNS SETOF "public"."flashcards"
    LANGUAGE "sql" STABLE
    AS $$
  with params as (
    select
      greatest(1, floor(p_limit * p_new_ratio))::int       as new_limit,
      greatest(1, floor(p_limit * (1 - p_new_ratio)))::int as due_limit
  ),
  due_cards as (
    select f.*
    from flashcards f
    join flashcard_progress p on p.flashcard_id = f.id and p.user_id = auth.uid()
    cross join params
    where f.deck_id = p_deck_id
      and p.is_suspended = false
      and p.state <> 'new'
      and p.due_at <= now()
    order by p.due_at asc
    limit (select due_limit from params)
  ),
  new_cards as (
    select f.*
    from flashcards f
    left join flashcard_progress p
      on p.flashcard_id = f.id and p.user_id = auth.uid()
    cross join params
    where f.deck_id = p_deck_id
      and (p.id is null or p.state = 'new')
      and coalesce(p.is_suspended, false) = false
    order by random()
    limit (select new_limit from params)
  ),
  combined as (
    select * from due_cards
    union all
    select * from new_cards
  )
  select * from combined
  order by random();
$$;


ALTER FUNCTION "public"."get_study_session"("p_deck_id" "uuid", "p_limit" integer, "p_new_ratio" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_review"("p_card_id" "uuid", "p_rating" "public"."review_rating", "p_state_after" "public"."card_state", "p_stability_after" double precision, "p_difficulty_after" double precision, "p_scheduled_days" integer, "p_due_at" timestamp with time zone, "p_step" smallint DEFAULT 0, "p_state_before" "public"."card_state" DEFAULT NULL::"public"."card_state", "p_stability_before" double precision DEFAULT NULL::double precision, "p_difficulty_before" double precision DEFAULT NULL::double precision, "p_elapsed_days" integer DEFAULT NULL::integer, "p_review_duration_ms" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
    v_user   uuid        := auth.uid();
    v_now    timestamptz := now();
    v_lapsed boolean     := (p_rating = 'again');
begin
    if v_user is null then
        raise exception 'not_authenticated';
    end if;

    insert into flashcard_progress (
        flashcard_id, user_id,
        stability, difficulty, state, step,
        due_at, last_reviewed_at,
        elapsed_days, scheduled_days,
        reps, lapses, last_rating
    ) values (
        p_card_id, v_user,
        p_stability_after, p_difficulty_after, p_state_after, coalesce(p_step, 0),
        p_due_at, v_now,
        coalesce(p_elapsed_days, 0), p_scheduled_days,
        1, case when v_lapsed then 1 else 0 end, p_rating
    )
    on conflict (flashcard_id, user_id) do update set
        stability        = excluded.stability,
        difficulty       = excluded.difficulty,
        state            = excluded.state,
        step             = excluded.step,
        due_at           = excluded.due_at,
        last_reviewed_at = excluded.last_reviewed_at,
        elapsed_days     = excluded.elapsed_days,
        scheduled_days   = excluded.scheduled_days,
        reps             = flashcard_progress.reps + 1,
        lapses           = flashcard_progress.lapses + case when v_lapsed then 1 else 0 end,
        last_rating      = excluded.last_rating;

    insert into flashcard_reviews (
        flashcard_id, user_id, rating,
        state_before, stability_before, difficulty_before, elapsed_days,
        stability_after, difficulty_after, scheduled_days,
        review_duration_ms, reviewed_at
    ) values (
        p_card_id, v_user, p_rating,
        p_state_before, p_stability_before, p_difficulty_before, p_elapsed_days,
        p_stability_after, p_difficulty_after, p_scheduled_days,
        p_review_duration_ms, v_now
    );
end;
$$;


ALTER FUNCTION "public"."record_review"("p_card_id" "uuid", "p_rating" "public"."review_rating", "p_state_after" "public"."card_state", "p_stability_after" double precision, "p_difficulty_after" double precision, "p_scheduled_days" integer, "p_due_at" timestamp with time zone, "p_step" smallint, "p_state_before" "public"."card_state", "p_stability_before" double precision, "p_difficulty_before" double precision, "p_elapsed_days" integer, "p_review_duration_ms" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_share_link"("p_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_link note_share_links%rowtype;
begin
  select * into v_link
  from note_share_links
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'invalid or expired link';
  end if;

  insert into note_share_link_grants (link_id, user_id)
  values (v_link.id, auth.uid())
  on conflict (link_id, user_id) do nothing;

  update note_share_links
  set use_count = use_count + 1
  where id = v_link.id;

  return v_link.note_id;
end $$;


ALTER FUNCTION "public"."redeem_share_link"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_jobs" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exams" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "folder_id" "uuid" NOT NULL,
    "exam_date" timestamp with time zone NOT NULL,
    "start_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_reps" integer DEFAULT 3 NOT NULL,
    "desired_retention" double precision DEFAULT 0.9 NOT NULL,
    "maintenance_retention" double precision DEFAULT 0.9 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "study_on_exam_date" boolean DEFAULT false NOT NULL,
    "final_review_enabled" boolean DEFAULT true NOT NULL,
    CONSTRAINT "exams_date_after_start" CHECK (("exam_date" > "start_date")),
    CONSTRAINT "exams_desired_retention_check" CHECK ((("desired_retention" > (0)::double precision) AND ("desired_retention" <= (1)::double precision))),
    CONSTRAINT "exams_maintenance_retention_check" CHECK ((("maintenance_retention" > (0)::double precision) AND ("maintenance_retention" <= (1)::double precision))),
    CONSTRAINT "exams_target_reps_check" CHECK ((("target_reps" >= 1) AND ("target_reps" <= 10)))
);


ALTER TABLE "public"."exams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flashcard_decks" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "fsrs_weights" double precision[],
    "desired_retention" double precision DEFAULT 0.9 NOT NULL,
    "weights_optimized_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."deck_status" DEFAULT 'idle'::"public"."deck_status" NOT NULL,
    "is_ai_generated" boolean DEFAULT false NOT NULL,
    "generation_started_at" timestamp with time zone,
    "generation_error" "text",
    "rating_mode" "public"."deck_rating_mode" DEFAULT 'full'::"public"."deck_rating_mode" NOT NULL
);


ALTER TABLE "public"."flashcard_decks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flashcard_progress" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "flashcard_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stability" double precision,
    "difficulty" double precision,
    "state" "public"."card_state" DEFAULT 'new'::"public"."card_state" NOT NULL,
    "step" smallint,
    "due_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_reviewed_at" timestamp with time zone,
    "elapsed_days" integer,
    "scheduled_days" integer,
    "reps" integer DEFAULT 0 NOT NULL,
    "lapses" integer DEFAULT 0 NOT NULL,
    "is_suspended" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_rating" "public"."review_rating" DEFAULT 'hard'::"public"."review_rating" NOT NULL
);


ALTER TABLE "public"."flashcard_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flashcard_reviews" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "flashcard_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" "public"."review_rating" NOT NULL,
    "state_before" "public"."card_state",
    "stability_before" double precision,
    "difficulty_before" double precision,
    "elapsed_days" integer,
    "stability_after" double precision,
    "difficulty_after" double precision,
    "scheduled_days" integer,
    "review_duration_ms" integer,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."flashcard_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flashcard_study_sessions" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "deck_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "duration_secs" integer DEFAULT 0 NOT NULL,
    "cards_reviewed" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."flashcard_study_sessions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."flashcards_with_progress" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."deck_id",
    "c"."user_id",
    "c"."front",
    "c"."back",
    "c"."hint",
    "p"."state" AS "progress_state",
    "p"."is_suspended",
    "p"."due_at",
    "p"."last_rating"
   FROM ("public"."flashcards" "c"
     LEFT JOIN "public"."flashcard_progress" "p" ON ((("p"."flashcard_id" = "c"."id") AND ("p"."user_id" = "auth"."uid"()))));


ALTER VIEW "public"."flashcards_with_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text",
    "color" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "exam_date_prompt_collapsed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."note_reports" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "share_token" "text",
    "reason" "public"."note_report_reason" NOT NULL,
    "description" "text",
    "reporter_email" "text",
    "reporter_name" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."note_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."note_share_link_grants" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "link_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."note_share_link_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."note_share_links" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "can_view" boolean DEFAULT true NOT NULL,
    "can_study" boolean DEFAULT false NOT NULL,
    "can_clone" boolean DEFAULT false NOT NULL,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "max_uses" integer,
    "use_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."note_share_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."note_shares" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "shared_with_id" "uuid" NOT NULL,
    "can_view" boolean DEFAULT true NOT NULL,
    "can_study" boolean DEFAULT false NOT NULL,
    "can_clone" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."note_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."note_sources" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "public"."source_kind" NOT NULL,
    "status" "public"."source_status" DEFAULT 'pending'::"public"."source_status" NOT NULL,
    "display_name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "storage_path" "text",
    "source_url" "text",
    "mime_type" "text",
    "file_size_bytes" bigint,
    "extracted_text" "text",
    "page_count" integer,
    "duration_secs" integer,
    "extraction_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."note_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "folder_id" "uuid",
    "title" "text" NOT NULL,
    "icon" "text",
    "raw_transcript" "text",
    "ai_summary" "text",
    "summary_status" "public"."note_status" DEFAULT 'draft'::"public"."note_status" NOT NULL,
    "word_count" integer DEFAULT 0 NOT NULL,
    "page_count" integer,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_opened_at" timestamp with time zone,
    "display_language_code" "text",
    "summary_error" "text"
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notes"."display_language_code" IS 'ISO 639-1 code for the language ai_summary is currently written in. Set by translate-summary and read by generate-flashcards / generate-quiz / generate-podcast so generated content matches.';



CREATE TABLE IF NOT EXISTS "public"."podcasts" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "status" "public"."podcast_status" DEFAULT 'generating'::"public"."podcast_status" NOT NULL,
    "audio_path" "text",
    "audio_url" "text",
    "duration_secs" integer,
    "script" "jsonb",
    "voice_config" "jsonb",
    "generation_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "progress_percent" smallint DEFAULT 0 NOT NULL,
    "notify_when_ready" boolean DEFAULT false NOT NULL,
    CONSTRAINT "podcasts_progress_percent_range" CHECK ((("progress_percent" >= 0) AND ("progress_percent" <= 100)))
);


ALTER TABLE "public"."podcasts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."podcasts"."notify_when_ready" IS 'When true, Cloud Run worker sends an APNs alert after status becomes ready.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "username" "text",
    "display_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_premium" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quiz_attempt_answers" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "attempt_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "selected_option" "text",
    "is_correct" boolean,
    "answered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."quiz_attempt_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quiz_attempts" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "score" integer,
    "total" integer NOT NULL,
    "percentage" numeric(5,2),
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."quiz_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quiz_question_reports" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "public"."quiz_question_report_reason" NOT NULL,
    "report_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quiz_question_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quiz_questions" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "question" "text" NOT NULL,
    "explanation" "text",
    "options" "jsonb" NOT NULL,
    "correct_option" "text" NOT NULL,
    "type" "public"."quiz_question_type" DEFAULT 'multiple_choice'::"public"."quiz_question_type" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."quiz_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quizzes" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "question_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."quiz_status" DEFAULT 'generating'::"public"."quiz_status" NOT NULL,
    "difficulty" "public"."quiz_difficulty" DEFAULT 'medium'::"public"."quiz_difficulty" NOT NULL,
    "is_multiple_choice" boolean DEFAULT true NOT NULL,
    "is_true_false" boolean DEFAULT false NOT NULL,
    "requested_count" integer DEFAULT 10 NOT NULL,
    "generation_error" "text"
);


ALTER TABLE "public"."quizzes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."summary_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bucket" "text" NOT NULL,
    "path" "text" NOT NULL,
    "status" "public"."summary_job_status" DEFAULT 'queued'::"public"."summary_job_status" NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "error" "text",
    "markdown" "text",
    "model" "text",
    "input_tokens" integer,
    "output_tokens" integer,
    "cost_usd" numeric(10,6),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "title" "text",
    "icon" "text",
    "note_id" "uuid"
);


ALTER TABLE "public"."summary_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_push_devices" (
    "id" "uuid" DEFAULT "public"."uuidv7"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_token" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_push_devices_token_len" CHECK ((("char_length"("device_token") >= 32) AND ("char_length"("device_token") <= 256)))
);


ALTER TABLE "public"."user_push_devices" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_jobs"
    ADD CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_one_per_folder" UNIQUE ("user_id", "folder_id");



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flashcard_progress"
    ADD CONSTRAINT "flashcard_progress_flashcard_id_user_id_key" UNIQUE ("flashcard_id", "user_id");



ALTER TABLE ONLY "public"."flashcard_progress"
    ADD CONSTRAINT "flashcard_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flashcard_reviews"
    ADD CONSTRAINT "flashcard_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flashcard_study_sessions"
    ADD CONSTRAINT "flashcard_study_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."note_reports"
    ADD CONSTRAINT "note_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."note_share_link_grants"
    ADD CONSTRAINT "note_share_link_grants_link_id_user_id_key" UNIQUE ("link_id", "user_id");



ALTER TABLE ONLY "public"."note_share_link_grants"
    ADD CONSTRAINT "note_share_link_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."note_share_links"
    ADD CONSTRAINT "note_share_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."note_share_links"
    ADD CONSTRAINT "note_share_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."note_shares"
    ADD CONSTRAINT "note_shares_note_id_shared_with_id_key" UNIQUE ("note_id", "shared_with_id");



ALTER TABLE ONLY "public"."note_shares"
    ADD CONSTRAINT "note_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."note_sources"
    ADD CONSTRAINT "note_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."podcasts"
    ADD CONSTRAINT "podcasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."quiz_attempt_answers"
    ADD CONSTRAINT "quiz_attempt_answers_attempt_id_question_id_key" UNIQUE ("attempt_id", "question_id");



ALTER TABLE ONLY "public"."quiz_attempt_answers"
    ADD CONSTRAINT "quiz_attempt_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quiz_attempts"
    ADD CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quiz_question_reports"
    ADD CONSTRAINT "quiz_question_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quiz_questions"
    ADD CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quiz_questions"
    ADD CONSTRAINT "quiz_questions_quiz_id_position_key" UNIQUE ("quiz_id", "position");



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."summary_jobs"
    ADD CONSTRAINT "summary_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_push_devices"
    ADD CONSTRAINT "user_push_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_push_devices"
    ADD CONSTRAINT "user_push_devices_user_token" UNIQUE ("user_id", "device_token");



CREATE INDEX "ai_jobs_user_kind_created" ON "public"."ai_jobs" USING "btree" ("user_id", "kind", "created_at" DESC);



CREATE INDEX "exams_user_active_idx" ON "public"."exams" USING "btree" ("user_id", "exam_date");



CREATE INDEX "exams_user_folder_idx" ON "public"."exams" USING "btree" ("user_id", "folder_id");



CREATE INDEX "flashcard_decks_note_id_idx" ON "public"."flashcard_decks" USING "btree" ("note_id");



CREATE UNIQUE INDEX "flashcard_decks_one_ai_per_note" ON "public"."flashcard_decks" USING "btree" ("note_id") WHERE "is_ai_generated";



CREATE INDEX "flashcard_progress_flashcard_id_idx" ON "public"."flashcard_progress" USING "btree" ("flashcard_id");



CREATE INDEX "flashcard_progress_user_id_due_at_idx" ON "public"."flashcard_progress" USING "btree" ("user_id", "due_at") WHERE ("is_suspended" = false);



CREATE INDEX "flashcard_reviews_flashcard_id_reviewed_at_idx" ON "public"."flashcard_reviews" USING "btree" ("flashcard_id", "reviewed_at");



CREATE INDEX "flashcard_reviews_user_id_reviewed_at_idx" ON "public"."flashcard_reviews" USING "btree" ("user_id", "reviewed_at" DESC);



CREATE INDEX "flashcard_study_sessions_deck_user" ON "public"."flashcard_study_sessions" USING "btree" ("deck_id", "user_id", "started_at" DESC);



CREATE INDEX "flashcards_deck_id_idx" ON "public"."flashcards" USING "btree" ("deck_id");



CREATE INDEX "folders_user_id_sort_order_idx" ON "public"."folders" USING "btree" ("user_id", "sort_order");



CREATE INDEX "note_reports_created_at_idx" ON "public"."note_reports" USING "btree" ("created_at" DESC);



CREATE INDEX "note_reports_note_id_idx" ON "public"."note_reports" USING "btree" ("note_id");



CREATE INDEX "note_share_link_grants_user_id_idx" ON "public"."note_share_link_grants" USING "btree" ("user_id");



CREATE INDEX "note_share_links_note_id_idx" ON "public"."note_share_links" USING "btree" ("note_id");



CREATE INDEX "note_share_links_owner_id_idx" ON "public"."note_share_links" USING "btree" ("owner_id");



CREATE INDEX "note_shares_note_id_idx" ON "public"."note_shares" USING "btree" ("note_id");



CREATE INDEX "note_shares_shared_with_id_idx" ON "public"."note_shares" USING "btree" ("shared_with_id");



CREATE INDEX "note_sources_note_id_sort_order_idx" ON "public"."note_sources" USING "btree" ("note_id", "sort_order");



CREATE INDEX "notes_title_trgm_idx" ON "public"."notes" USING "gin" ("title" "public"."gin_trgm_ops");



CREATE INDEX "notes_user_id_folder_id_updated_at_idx" ON "public"."notes" USING "btree" ("user_id", "folder_id", "updated_at" DESC);



CREATE INDEX "notes_user_id_is_archived_updated_at_idx" ON "public"."notes" USING "btree" ("user_id", "is_archived", "updated_at" DESC);



CREATE INDEX "podcasts_note_id_idx" ON "public"."podcasts" USING "btree" ("note_id");



CREATE INDEX "podcasts_user_id_created_at_idx" ON "public"."podcasts" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "profiles_username_lower_idx" ON "public"."profiles" USING "btree" ("lower"("username"));



CREATE INDEX "quiz_attempt_answers_attempt_idx" ON "public"."quiz_attempt_answers" USING "btree" ("attempt_id");



CREATE INDEX "quiz_attempts_user_id_completed_at_idx" ON "public"."quiz_attempts" USING "btree" ("user_id", "completed_at" DESC);



CREATE INDEX "quiz_question_reports_question_idx" ON "public"."quiz_question_reports" USING "btree" ("question_id");



CREATE INDEX "quiz_question_reports_user_idx" ON "public"."quiz_question_reports" USING "btree" ("user_id");



CREATE INDEX "quiz_questions_quiz_id_position_idx" ON "public"."quiz_questions" USING "btree" ("quiz_id", "position");



CREATE INDEX "quizzes_note_id_idx" ON "public"."quizzes" USING "btree" ("note_id");



CREATE INDEX "summary_jobs_note_id_idx" ON "public"."summary_jobs" USING "btree" ("note_id");



CREATE INDEX "summary_jobs_status_idx" ON "public"."summary_jobs" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['queued'::"public"."summary_job_status", 'processing'::"public"."summary_job_status"]));



CREATE INDEX "summary_jobs_user_id_created_at_idx" ON "public"."summary_jobs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "user_push_devices_user_id_idx" ON "public"."user_push_devices" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "summary_jobs_set_updated_at" BEFORE UPDATE ON "public"."summary_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "t_exams_updated" BEFORE UPDATE ON "public"."exams" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "t_flashcard_progress_updated" BEFORE UPDATE ON "public"."flashcard_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "t_folders_updated" BEFORE UPDATE ON "public"."folders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "t_note_sources_updated" BEFORE UPDATE ON "public"."note_sources" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "t_notes_updated" BEFORE UPDATE ON "public"."notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "t_podcasts_updated" BEFORE UPDATE ON "public"."podcasts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "t_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."ai_jobs"
    ADD CONSTRAINT "ai_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_progress"
    ADD CONSTRAINT "flashcard_progress_flashcard_id_fkey" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_progress"
    ADD CONSTRAINT "flashcard_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_reviews"
    ADD CONSTRAINT "flashcard_reviews_flashcard_id_fkey" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_reviews"
    ADD CONSTRAINT "flashcard_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_study_sessions"
    ADD CONSTRAINT "flashcard_study_sessions_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."flashcard_decks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_study_sessions"
    ADD CONSTRAINT "flashcard_study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."flashcard_decks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_reports"
    ADD CONSTRAINT "note_reports_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_share_link_grants"
    ADD CONSTRAINT "note_share_link_grants_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."note_share_links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_share_link_grants"
    ADD CONSTRAINT "note_share_link_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_share_links"
    ADD CONSTRAINT "note_share_links_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_share_links"
    ADD CONSTRAINT "note_share_links_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_shares"
    ADD CONSTRAINT "note_shares_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_shares"
    ADD CONSTRAINT "note_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_shares"
    ADD CONSTRAINT "note_shares_shared_with_id_fkey" FOREIGN KEY ("shared_with_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_sources"
    ADD CONSTRAINT "note_sources_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."note_sources"
    ADD CONSTRAINT "note_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."podcasts"
    ADD CONSTRAINT "podcasts_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."podcasts"
    ADD CONSTRAINT "podcasts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_attempt_answers"
    ADD CONSTRAINT "quiz_attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_attempt_answers"
    ADD CONSTRAINT "quiz_attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_attempt_answers"
    ADD CONSTRAINT "quiz_attempt_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_attempts"
    ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_attempts"
    ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_question_reports"
    ADD CONSTRAINT "quiz_question_reports_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_question_reports"
    ADD CONSTRAINT "quiz_question_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_questions"
    ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_questions"
    ADD CONSTRAINT "quiz_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."summary_jobs"
    ADD CONSTRAINT "summary_jobs_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."summary_jobs"
    ADD CONSTRAINT "summary_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_push_devices"
    ADD CONSTRAINT "user_push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."ai_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_jobs self read" ON "public"."ai_jobs" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "attempt answers via attempt" ON "public"."quiz_attempt_answers" USING ((EXISTS ( SELECT 1
   FROM "public"."quiz_attempts" "a"
  WHERE (("a"."id" = "quiz_attempt_answers"."attempt_id") AND ("a"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."quiz_attempts" "a"
  WHERE (("a"."id" = "quiz_attempt_answers"."attempt_id") AND ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "cards select" ON "public"."flashcards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."flashcard_decks" "d"
  WHERE (("d"."id" = "flashcards"."deck_id") AND "public"."can_access_note"("d"."note_id", "p_require_study" => true)))));



CREATE POLICY "cards write" ON "public"."flashcards" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "decks select" ON "public"."flashcard_decks" FOR SELECT USING ("public"."can_access_note"("note_id", "p_require_study" => true));



CREATE POLICY "decks write" ON "public"."flashcard_decks" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."exams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exams_delete_self" ON "public"."exams" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "exams_insert_self" ON "public"."exams" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "exams_select_self" ON "public"."exams" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "exams_update_self" ON "public"."exams" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."flashcard_decks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flashcard_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flashcard_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flashcard_study_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flashcards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "grants own" ON "public"."note_share_link_grants" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "links owner" ON "public"."note_share_links" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."note_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."note_share_link_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."note_share_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."note_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."note_sources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "note_sources delete self" ON "public"."note_sources" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "note_sources insert self" ON "public"."note_sources" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "note_sources read self" ON "public"."note_sources" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "note_sources update self" ON "public"."note_sources" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notes select" ON "public"."notes" FOR SELECT USING ("public"."can_access_note"("id"));



CREATE POLICY "notes write" ON "public"."notes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own attempts" ON "public"."quiz_attempts" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own folders" ON "public"."folders" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own progress" ON "public"."flashcard_progress" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own reviews" ON "public"."flashcard_reviews" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."podcasts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "podcasts delete self" ON "public"."podcasts" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "podcasts insert self" ON "public"."podcasts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "podcasts read self" ON "public"."podcasts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "podcasts select" ON "public"."podcasts" FOR SELECT USING ("public"."can_access_note"("note_id", "p_require_study" => true));



CREATE POLICY "podcasts update self" ON "public"."podcasts" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "podcasts write" ON "public"."podcasts" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles read" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "profiles self write" ON "public"."profiles" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "questions select" ON "public"."quiz_questions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."quizzes" "q"
  WHERE (("q"."id" = "quiz_questions"."quiz_id") AND "public"."can_access_note"("q"."note_id", "p_require_study" => true)))));



CREATE POLICY "questions write" ON "public"."quiz_questions" USING ((EXISTS ( SELECT 1
   FROM "public"."quizzes" "q"
  WHERE (("q"."id" = "quiz_questions"."quiz_id") AND ("q"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."quizzes" "q"
  WHERE (("q"."id" = "quiz_questions"."quiz_id") AND ("q"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."quiz_attempt_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quiz_attempt_answers delete self" ON "public"."quiz_attempt_answers" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "quiz_attempt_answers insert self" ON "public"."quiz_attempt_answers" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "quiz_attempt_answers read self" ON "public"."quiz_attempt_answers" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."quiz_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quiz_attempts delete self" ON "public"."quiz_attempts" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "quiz_attempts insert self" ON "public"."quiz_attempts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "quiz_attempts read self" ON "public"."quiz_attempts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "quiz_attempts update self" ON "public"."quiz_attempts" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."quiz_question_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quiz_question_reports insert self" ON "public"."quiz_question_reports" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "quiz_question_reports read self" ON "public"."quiz_question_reports" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."quiz_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quiz_questions delete self" ON "public"."quiz_questions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "quiz_questions insert self" ON "public"."quiz_questions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "quiz_questions read self" ON "public"."quiz_questions" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."quizzes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quizzes delete self" ON "public"."quizzes" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "quizzes insert self" ON "public"."quizzes" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "quizzes read self" ON "public"."quizzes" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "quizzes select" ON "public"."quizzes" FOR SELECT USING ("public"."can_access_note"("note_id", "p_require_study" => true));



CREATE POLICY "quizzes update self" ON "public"."quizzes" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "quizzes write" ON "public"."quizzes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "shares owner" ON "public"."note_shares" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "shares recipient read" ON "public"."note_shares" FOR SELECT USING (("shared_with_id" = "auth"."uid"()));



CREATE POLICY "sources select" ON "public"."note_sources" FOR SELECT USING ("public"."can_access_note"("note_id"));



CREATE POLICY "sources write" ON "public"."note_sources" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "study sessions self delete" ON "public"."flashcard_study_sessions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "study sessions self insert" ON "public"."flashcard_study_sessions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "study sessions self select" ON "public"."flashcard_study_sessions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "study sessions self update" ON "public"."flashcard_study_sessions" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."summary_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_push_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_push_devices delete own" ON "public"."user_push_devices" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_push_devices insert own" ON "public"."user_push_devices" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_push_devices select own" ON "public"."user_push_devices" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_push_devices update own" ON "public"."user_push_devices" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users insert own jobs" ON "public"."summary_jobs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users read own jobs" ON "public"."summary_jobs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users update own jobs" ON "public"."summary_jobs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_note"("p_note_id" "uuid", "p_require_study" boolean, "p_require_clone" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_note"("p_note_id" "uuid", "p_require_study" boolean, "p_require_clone" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_note"("p_note_id" "uuid", "p_require_study" boolean, "p_require_clone" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."clone_note"("p_note_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clone_note"("p_note_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_note"("p_note_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."exam_card_set"("p_exam_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."exam_card_set"("p_exam_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exam_card_set"("p_exam_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_exam_card_states"("p_exam_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_exam_card_states"("p_exam_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exam_card_states"("p_exam_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_exam_study_queue"("p_exam_id" "uuid", "p_limit" integer, "p_period" "public"."exam_period", "p_new_count" integer, "p_exclude_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_exam_study_queue"("p_exam_id" "uuid", "p_limit" integer, "p_period" "public"."exam_period", "p_new_count" integer, "p_exclude_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exam_study_queue"("p_exam_id" "uuid", "p_limit" integer, "p_period" "public"."exam_period", "p_new_count" integer, "p_exclude_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_again_rate"("p_window_days" integer, "p_min_reviews" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_again_rate"("p_window_days" integer, "p_min_reviews" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_again_rate"("p_window_days" integer, "p_min_reviews" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_study_queue"("p_deck_id" "uuid", "p_limit" integer, "p_new_ratio" numeric, "p_allow_ahead" boolean, "p_exclude_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_study_queue"("p_deck_id" "uuid", "p_limit" integer, "p_new_ratio" numeric, "p_allow_ahead" boolean, "p_exclude_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_study_queue"("p_deck_id" "uuid", "p_limit" integer, "p_new_ratio" numeric, "p_allow_ahead" boolean, "p_exclude_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."uuidv7"() TO "anon";
GRANT ALL ON FUNCTION "public"."uuidv7"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."uuidv7"() TO "service_role";



GRANT ALL ON TABLE "public"."flashcards" TO "anon";
GRANT ALL ON TABLE "public"."flashcards" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcards" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_study_session"("p_deck_id" "uuid", "p_limit" integer, "p_new_ratio" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_study_session"("p_deck_id" "uuid", "p_limit" integer, "p_new_ratio" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_study_session"("p_deck_id" "uuid", "p_limit" integer, "p_new_ratio" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_review"("p_card_id" "uuid", "p_rating" "public"."review_rating", "p_state_after" "public"."card_state", "p_stability_after" double precision, "p_difficulty_after" double precision, "p_scheduled_days" integer, "p_due_at" timestamp with time zone, "p_step" smallint, "p_state_before" "public"."card_state", "p_stability_before" double precision, "p_difficulty_before" double precision, "p_elapsed_days" integer, "p_review_duration_ms" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."record_review"("p_card_id" "uuid", "p_rating" "public"."review_rating", "p_state_after" "public"."card_state", "p_stability_after" double precision, "p_difficulty_after" double precision, "p_scheduled_days" integer, "p_due_at" timestamp with time zone, "p_step" smallint, "p_state_before" "public"."card_state", "p_stability_before" double precision, "p_difficulty_before" double precision, "p_elapsed_days" integer, "p_review_duration_ms" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_review"("p_card_id" "uuid", "p_rating" "public"."review_rating", "p_state_after" "public"."card_state", "p_stability_after" double precision, "p_difficulty_after" double precision, "p_scheduled_days" integer, "p_due_at" timestamp with time zone, "p_step" smallint, "p_state_before" "public"."card_state", "p_stability_before" double precision, "p_difficulty_before" double precision, "p_elapsed_days" integer, "p_review_duration_ms" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_share_link"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_share_link"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_share_link"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_jobs" TO "anon";
GRANT ALL ON TABLE "public"."ai_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."exams" TO "anon";
GRANT ALL ON TABLE "public"."exams" TO "authenticated";
GRANT ALL ON TABLE "public"."exams" TO "service_role";



GRANT ALL ON TABLE "public"."flashcard_decks" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_decks" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_decks" TO "service_role";



GRANT ALL ON TABLE "public"."flashcard_progress" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_progress" TO "service_role";



GRANT ALL ON TABLE "public"."flashcard_reviews" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."flashcard_study_sessions" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_study_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_study_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."flashcards_with_progress" TO "anon";
GRANT ALL ON TABLE "public"."flashcards_with_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcards_with_progress" TO "service_role";



GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";



GRANT ALL ON TABLE "public"."note_reports" TO "anon";
GRANT ALL ON TABLE "public"."note_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."note_reports" TO "service_role";



GRANT ALL ON TABLE "public"."note_share_link_grants" TO "anon";
GRANT ALL ON TABLE "public"."note_share_link_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."note_share_link_grants" TO "service_role";



GRANT ALL ON TABLE "public"."note_share_links" TO "anon";
GRANT ALL ON TABLE "public"."note_share_links" TO "authenticated";
GRANT ALL ON TABLE "public"."note_share_links" TO "service_role";



GRANT ALL ON TABLE "public"."note_shares" TO "anon";
GRANT ALL ON TABLE "public"."note_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."note_shares" TO "service_role";



GRANT ALL ON TABLE "public"."note_sources" TO "anon";
GRANT ALL ON TABLE "public"."note_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."note_sources" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "anon";
GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "service_role";



GRANT ALL ON TABLE "public"."podcasts" TO "anon";
GRANT ALL ON TABLE "public"."podcasts" TO "authenticated";
GRANT ALL ON TABLE "public"."podcasts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."quiz_attempt_answers" TO "anon";
GRANT ALL ON TABLE "public"."quiz_attempt_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_attempt_answers" TO "service_role";



GRANT ALL ON TABLE "public"."quiz_attempts" TO "anon";
GRANT ALL ON TABLE "public"."quiz_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."quiz_question_reports" TO "anon";
GRANT ALL ON TABLE "public"."quiz_question_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_question_reports" TO "service_role";



GRANT ALL ON TABLE "public"."quiz_questions" TO "anon";
GRANT ALL ON TABLE "public"."quiz_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_questions" TO "service_role";



GRANT ALL ON TABLE "public"."quizzes" TO "anon";
GRANT ALL ON TABLE "public"."quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."summary_jobs" TO "anon";
GRANT ALL ON TABLE "public"."summary_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."summary_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."user_push_devices" TO "anon";
GRANT ALL ON TABLE "public"."user_push_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."user_push_devices" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







