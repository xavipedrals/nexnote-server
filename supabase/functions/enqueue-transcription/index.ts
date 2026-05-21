// enqueue-transcription
// ---------------------------------------------------------------------------
// Validates the caller, rate-limits, flips the audio note_source to
// 'extracting', then kicks the Cloud Run worker which downloads the file,
// runs it through Whisper, writes the transcript back into
// `note_sources.extracted_text`, and flips status to 'ready'.
//
// The note_source row must already exist (created when iOS uploaded the
// audio file). This function is idempotent: callable again to retry a
// failed transcription.
//
// verify_jwt = false — same rationale as enqueue-podcast.
//
// Required env vars:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - WORKER_URL
//   - WORKER_SHARED_SECRET
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkDailyJobLimit } from "../_shared/premium.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_URL = Deno.env.get("WORKER_URL")!;
const WORKER_SHARED_SECRET = Deno.env.get("WORKER_SHARED_SECRET")!;

const JOB_KIND = "transcription";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
    sourceId?: string;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return json({ error: "invalid_body" }, 400);
    }

    const sourceId = body.sourceId;
    if (!sourceId) return json({ error: "invalid_body" }, 400);

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    // Load the source. Must be owned by caller, kind=audio, and have a file.
    const { data: source, error: srcErr } = await admin
        .from("note_sources")
        .select("id, user_id, note_id, kind, status, storage_path")
        .eq("id", sourceId)
        .single();
    if (srcErr || !source) return json({ error: "source_not_found" }, 404);
    if (source.user_id !== userId) return json({ error: "forbidden" }, 403);
    if (source.kind !== "audio") return json({ error: "not_audio" }, 400);
    if (!source.storage_path) {
        return json({ error: "no_file_uploaded" }, 400);
    }
    if (source.status === "extracting") {
        return json({ error: "already_in_progress" }, 409);
    }

    const rate = await checkDailyJobLimit(admin, userId, JOB_KIND);
    if (!rate.allowed) {
        return json(rate.body, rate.status);
    }

    // Flip the source to 'extracting' and clear any previous error.
    const { error: updateErr } = await admin
        .from("note_sources")
        .update({ status: "extracting", extraction_error: null })
        .eq("id", sourceId);
    if (updateErr) {
        return json({ error: `update_failed: ${updateErr.message}` }, 500);
    }

    await admin.from("ai_jobs").insert({ user_id: userId, kind: JOB_KIND });

    const kick = fetch(`${WORKER_URL}/transcribe`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${WORKER_SHARED_SECRET}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            sourceId: source.id,
            userId,
            noteId: source.note_id,
            storagePath: source.storage_path,
        }),
    }).catch((e) => {
        console.error("kick worker failed", e);
        return admin
            .from("note_sources")
            .update({ status: "failed", extraction_error: "worker_unreachable" })
            .eq("id", sourceId);
    });

    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(kick);

    return json({ sourceId: source.id, status: "extracting" }, 202);
});

function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json", ...CORS },
    });
}
