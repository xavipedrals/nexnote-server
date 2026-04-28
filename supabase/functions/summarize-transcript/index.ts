// summarize-transcript
// ---------------------------------------------------------------------------
// Validates the caller, creates or resets a `summary_jobs` row in 'queued'
// state, then kicks the Cloud Run worker which downloads the transcript,
// calls Gemini, and writes the title / icon / markdown back onto both the
// job row and the owning `notes` row. Returns 202 immediately. The iOS
// client subscribes to the note row via Realtime to flip from
// "Generating…" to the real summary.
//
// Endpoint name and request body are unchanged from the previous
// edge-function-only implementation, so the iOS client doesn't need to
// change. The actual Gemini call now runs on Cloud Run, where wall-clock
// limits don't kill long generations the way edge functions did.
//
// verify_jwt = false — same rationale as enqueue-podcast / enqueue-transcription.
//
// Required env vars:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - WORKER_URL                 (e.g. https://nexnote-worker-xxx.run.app)
//   - WORKER_SHARED_SECRET       (Bearer token Cloud Run validates)
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_URL = Deno.env.get("WORKER_URL")!;
const WORKER_SHARED_SECRET = Deno.env.get("WORKER_SHARED_SECRET")!;

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
    bucket?: string;
    path?: string;
    /// The note that owns this summary. The worker writes the generated
    /// title / icon / markdown back onto this row and flips
    /// `summary_status` when it's done.
    noteId?: string;
    /// Provided when retrying an existing job; the row is reset and
    /// `retry_count` is bumped.
    jobId?: string;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return json({ error: "unauthorized" }, 401);
    }

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return json({ error: "invalid_body" }, 400);
    }
    if (!body.bucket || !body.path || !body.noteId) {
        return json({ error: "invalid_body" }, 400);
    }

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

    const jobId = body.jobId ?? crypto.randomUUID();
    const { data: job, error: upsertErr } = await admin
        .from("summary_jobs")
        .upsert(
            {
                id: jobId,
                user_id: userId,
                note_id: body.noteId,
                bucket: body.bucket,
                path: body.path,
                status: "queued",
                error: null,
                markdown: null,
                retry_count: body.jobId ? undefined : 0,
                started_at: null,
                completed_at: null,
            },
            { onConflict: "id" },
        )
        .select()
        .single();
    if (upsertErr || !job) {
        return json({ error: `Failed to create job: ${upsertErr?.message}` }, 500);
    }

    if (body.jobId) {
        await admin
            .from("summary_jobs")
            .update({ retry_count: (job.retry_count ?? 0) + 1 })
            .eq("id", jobId);
    }

    const noteId = body.noteId;
    const kick = fetch(`${WORKER_URL}/summarize`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${WORKER_SHARED_SECRET}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            jobId,
            noteId,
            bucket: body.bucket,
            path: body.path,
        }),
    }).catch(async (e) => {
        console.error("kick worker failed", e);
        await admin
            .from("summary_jobs")
            .update({
                status: "failed",
                error: "worker_unreachable",
                completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        await admin
            .from("notes")
            .update({ summary_status: "failed", summary_error: "worker_unreachable" })
            .eq("id", noteId);
    });

    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(kick);

    return json({ jobId, status: "queued" }, 202);
});

function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json", ...CORS },
    });
}
