// enqueue-podcast
// ---------------------------------------------------------------------------
// Validates the caller, rate-limits, creates a `podcasts` row in 'generating'
// state, then kicks the Cloud Run worker which does the actual LLM-script +
// ElevenLabs-TTS + storage-upload work. Returns 202 immediately. The iOS
// client subscribes to the row via Realtime to see status changes.
//
// verify_jwt = false — iOS sends the publishable key when no user session is
// open; this function does its own auth.getUser() check.
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

const DAILY_RATE_LIMIT = 5; // podcasts per user per 24h
const MAX_TARGET_MINUTES = 20;
const MIN_TARGET_MINUTES = 3;

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
    noteId?: string;
    /// User-selected key points / sections to focus the podcast on. Free text;
    /// the worker prepends it to the note transcript when prompting the LLM.
    focus?: string;
    /// Target duration in minutes. Capped at MAX_TARGET_MINUTES.
    targetMinutes?: number;
    /// Optional title; if omitted the worker derives one from the script.
    title?: string;
    /// ISO 639-1 language code for the generated podcast (e.g. "en", "es").
    /// Overrides `notes.display_language_code` for both the LLM prompt and
    /// the TTS engine. Falls back to the note's display language when null.
    languageCode?: string;
    /// When true (e.g. iOS DEBUG), worker uses APNs sandbox for the completion
    /// push for this job. Production iOS builds omit this; Cloud Run env
    /// `APNS_USE_SANDBOX` remains the default for everyone else.
    useApnsSandbox?: boolean;
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

    const noteId = body.noteId;
    if (!noteId) return json({ error: "invalid_body" }, 400);

    const targetMinutes = clamp(
        Math.floor(body.targetMinutes ?? 10),
        MIN_TARGET_MINUTES,
        MAX_TARGET_MINUTES,
    );

    // Trim to a reasonable shape — anything past two letters is almost
    // certainly garbage. We keep `null` (rather than empty string) so the
    // worker's `?? note.display_language_code` fallback works cleanly.
    const rawLang = (body.languageCode ?? "").trim().toLowerCase();
    const languageCode = /^[a-z]{2,3}(-[a-z0-9]+)?$/i.test(rawLang)
        ? rawLang
        : null;

    // Identity check via user-scoped client.
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

    // Ownership check.
    const { data: note, error: noteErr } = await admin
        .from("notes")
        .select("id, user_id, title")
        .eq("id", noteId)
        .single();
    if (noteErr || !note) return json({ error: "note_not_found" }, 404);
    if (note.user_id !== userId) return json({ error: "forbidden" }, 403);

    // Rate-limit: count podcast jobs in last 24h.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await admin
        .from("ai_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "podcast")
        .gte("created_at", since);
    if (countErr) return json({ error: "rate_check_failed" }, 500);
    if ((count ?? 0) >= DAILY_RATE_LIMIT) {
        return json({ error: "rate_limited", limit: DAILY_RATE_LIMIT }, 429);
    }

    // Insert the podcast row in 'generating' state — the worker will fill in
    // audio_path / script / status when it finishes.
    const title = (body.title?.trim() || `${note.title} — Podcast`).slice(0, 200);
    const { data: podcast, error: insertErr } = await admin
        .from("podcasts")
        .insert({
            note_id: noteId,
            user_id: userId,
            title,
            status: "generating",
        })
        .select("id")
        .single();
    if (insertErr || !podcast) {
        return json({ error: `insert_failed: ${insertErr?.message}` }, 500);
    }

    // Record the rate-limit tick.
    await admin.from("ai_jobs").insert({ user_id: userId, kind: "podcast" });

    // Kick the worker. We don't await the body — Cloud Run replies 202 fast
    // and continues processing in the background. waitUntil keeps the request
    // alive long enough for the headers to land.
    const kick = fetch(`${WORKER_URL}/podcast`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${WORKER_SHARED_SECRET}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            podcastId: podcast.id,
            userId,
            noteId,
            focus: body.focus ?? null,
            targetMinutes,
            languageCode,
            ...(body.useApnsSandbox === true ? { useApnsSandbox: true } : {}),
        }),
    }).catch((e) => {
        console.error("kick worker failed", e);
        // Mark as failed so iOS doesn't spin forever.
        return admin
            .from("podcasts")
            .update({ status: "failed", generation_error: "worker_unreachable" })
            .eq("id", podcast.id);
    });

    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(kick);

    return json({ podcastId: podcast.id, status: "generating" }, 202);
});

function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json", ...CORS },
    });
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}
