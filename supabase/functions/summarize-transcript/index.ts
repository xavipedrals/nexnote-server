import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.ts";
import { generateSummary } from "./gemini.ts";

const MAX_TRANSCRIPT_CHARS = 800_000; // ~200k tokens; stay well under Gemini 2.5 Flash 1M context.

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
    bucket: string;
    path: string;
    /// The note that owns this summary. The function writes the generated
    /// title / icon / markdown back onto this row and flips
    /// `summary_status` when it's done. Required for the new async flow.
    noteId: string;
    jobId?: string; // Provided when retrying an existing job.
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey || !geminiKey) {
        return json({ error: "Server misconfigured: missing env vars" }, 500);
    }

    // Authenticate the caller using their JWT.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
        return json({ error: "Invalid token" }, 401);
    }
    const userId = userData.user.id;

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.bucket || !body.path || !body.noteId) {
        return json({ error: "bucket, path, and noteId are required" }, 400);
    }

    // Service-role client does the DB + storage work in the background task.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
    });

    // Create or reset the job row.
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
                retry_count: body.jobId ? undefined : 0, // only set on first insert
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

    // For a retry, bump retry_count explicitly (upsert can't increment).
    if (body.jobId) {
        await admin
            .from("summary_jobs")
            .update({ retry_count: (job.retry_count ?? 0) + 1 })
            .eq("id", jobId);
    }

    // Fire the background work. The response is sent immediately so the
    // client can dismiss its sheet and return to the notes list; the note row
    // (already in `processing` state) will flip to `ready`/`failed` via
    // Realtime when `runJob` finishes.
    EdgeRuntime.waitUntil(
        runJob(admin, jobId, body.noteId, body.bucket, body.path, geminiKey),
    );

    return json({ jobId, status: "queued" }, 202);
});

async function runJob(
    admin: SupabaseClient,
    jobId: string,
    noteId: string,
    bucket: string,
    path: string,
    geminiKey: string,
) {
    try {
        await admin
            .from("summary_jobs")
            .update({ status: "processing", started_at: new Date().toISOString() })
            .eq("id", jobId);

        // Download the transcript from Storage.
        const { data: file, error: dlErr } = await admin.storage.from(bucket).download(path);
        if (dlErr || !file) throw new Error(`Storage download failed: ${dlErr?.message}`);

        let transcript = await file.text();
        transcript = transcript.trim();
        if (!transcript) throw new Error("Transcript is empty");
        if (transcript.length > MAX_TRANSCRIPT_CHARS) {
            transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
        }

        const result = await generateSummary(SYSTEM_PROMPT, buildUserPrompt(transcript), geminiKey);

        await admin
            .from("summary_jobs")
            .update({
                status: "complete",
                markdown: result.markdown,
                title: result.title,
                icon: result.icon,
                model: result.model,
                input_tokens: result.inputTokens,
                output_tokens: result.outputTokens,
                cost_usd: result.costUsd,
                completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);

        // Land the generated content on the owning note so the client's list +
        // detail views can flip from "Generating…" to the real summary via
        // Realtime. Title / icon replace the placeholders the client wrote
        // when it created the pending note. Clear `summary_error` in case
        // this is a successful retry after a previous failure.
        await admin
            .from("notes")
            .update({
                title: result.title,
                icon: result.icon,
                ai_summary: result.markdown,
                summary_status: "ready",
                summary_error: null,
            })
            .eq("id", noteId);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Job ${jobId} failed:`, message);
        await admin
            .from("summary_jobs")
            .update({
                status: "failed",
                error: message.slice(0, 2000),
                completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);

        // Mirror the failure onto the note so the list / detail can offer
        // retry-or-delete and show the user *why* it failed. The job row
        // still holds the full per-attempt history in `summary_jobs.error`;
        // `notes.summary_error` is the human-readable reason for the row's
        // current `failed` state.
        await admin
            .from("notes")
            .update({
                summary_status: "failed",
                summary_error: message.slice(0, 2000),
            })
            .eq("id", noteId);
    }
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...CORS },
    });
}
