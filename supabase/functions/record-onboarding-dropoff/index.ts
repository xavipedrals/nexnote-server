// record-onboarding-dropoff
// ---------------------------------------------------------------------------
// Public POST endpoint for pre-auth onboarding abandon events from iOS.
// Inserts/upserts into `public.onboarding_dropoffs` with the service role
// (table has no client write policies).
//
// Required env vars:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Request body (JSON):
//   {
//     "install_id": "...",
//     "session_id": "...",
//     "flow_version": "onboarding_b_2026_05",
//     "dropped_at_step": "whatMotivatesYou",
//     "last_answered_step": "whereDoNotesComeFrom",
//     "steps_reached": ["welcome", "letsGo", ...],
//     "answers": { "who_are_you": "student", ... },
//     "experiment_variant": "control",
//     "app_version": "1.0",
//     "locale": "en-US"
//   }
//
// Response: { "ok": true } on success, { "error": "..." } otherwise.
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_ID_LEN = 128;
const MAX_STEP_LEN = 64;
const MAX_JSON_BYTES = 16_384;
const MAX_ROWS_PER_INSTALL_HOUR = 30;

interface RequestBody {
    install_id?: string;
    session_id?: string;
    flow_version?: string;
    dropped_at_step?: string;
    last_answered_step?: string;
    steps_reached?: unknown;
    answers?: unknown;
    experiment_variant?: string;
    app_version?: string;
    locale?: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (req.method !== "POST") return cors(jsonError(405, "Method not allowed"));

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return cors(jsonError(400, "Invalid JSON body"));
    }

    const installId = trimRequired(body.install_id, MAX_ID_LEN);
    const sessionId = trimRequired(body.session_id, MAX_ID_LEN);
    const flowVersion = trimRequired(body.flow_version, MAX_ID_LEN);
    const droppedAtStep = trimRequired(body.dropped_at_step, MAX_STEP_LEN);

    if (!installId || !sessionId || !flowVersion || !droppedAtStep) {
        return cors(jsonError(400, "install_id, session_id, flow_version, and dropped_at_step are required"));
    }

    const lastAnsweredStep = trimOrNull(body.last_answered_step, MAX_STEP_LEN);
    const experimentVariant = trimOrNull(body.experiment_variant, MAX_STEP_LEN);
    const appVersion = trimOrNull(body.app_version, 32);
    const locale = trimOrNull(body.locale, 32);

    let stepsReached: string[];
    try {
        stepsReached = normalizeStringArray(body.steps_reached);
    } catch (e) {
        return cors(jsonError(400, (e as Error).message));
    }

    let answers: Record<string, unknown>;
    try {
        answers = normalizeAnswers(body.answers);
    } catch (e) {
        return cors(jsonError(400, (e as Error).message));
    }

    const payloadBytes = new TextEncoder().encode(
        JSON.stringify({ steps_reached: stepsReached, answers }),
    ).length;
    if (payloadBytes > MAX_JSON_BYTES) {
        return cors(jsonError(400, "Payload too large"));
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await admin
        .from("onboarding_dropoffs")
        .select("id", { count: "exact", head: true })
        .eq("install_id", installId)
        .gte("created_at", oneHourAgo);

    if (countErr) {
        console.error("[record-onboarding-dropoff] rate limit check failed:", countErr.message);
        return cors(jsonError(500, "Couldn't save drop-off"));
    }
    if ((count ?? 0) >= MAX_ROWS_PER_INSTALL_HOUR) {
        return cors(jsonError(429, "Too many requests"));
    }

    const row = {
        install_id: installId,
        session_id: sessionId,
        flow_version: flowVersion,
        experiment_variant: experimentVariant,
        dropped_at_step: droppedAtStep,
        last_answered_step: lastAnsweredStep,
        steps_reached: stepsReached,
        answers,
        app_version: appVersion,
        locale,
    };

    const { error: upsertErr } = await admin
        .from("onboarding_dropoffs")
        .upsert(row, { onConflict: "session_id" });

    if (upsertErr) {
        console.error("[record-onboarding-dropoff] upsert failed:", upsertErr.message);
        return cors(jsonError(500, `Couldn't save drop-off: ${upsertErr.message}`));
    }

    return cors(jsonOk({ ok: true }));
});

function normalizeStringArray(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new Error("steps_reached must be an array");
    const out: string[] = [];
    for (const item of value) {
        if (typeof item !== "string") throw new Error("steps_reached must contain strings");
        const trimmed = item.trim();
        if (!trimmed) continue;
        if (trimmed.length > MAX_STEP_LEN) {
            out.push(trimmed.slice(0, MAX_STEP_LEN));
        } else {
            out.push(trimmed);
        }
    }
    return out;
}

function normalizeAnswers(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) return {};
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error("answers must be an object");
    }
    const raw = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
        const k = key.trim();
        if (!k || k.length > 64) continue;
        if (typeof val === "string") {
            out[k] = val.length > 256 ? val.slice(0, 256) : val;
        } else if (Array.isArray(val)) {
            const arr = val
                .filter((x) => typeof x === "string")
                .map((x) => (x as string).trim())
                .filter(Boolean)
                .map((x) => (x.length > 256 ? x.slice(0, 256) : x))
                .slice(0, 32);
            out[k] = arr;
        } else {
            continue;
        }
    }
    return out;
}

function trimRequired(v: string | undefined, max: number): string | null {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    if (!trimmed) return null;
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function trimOrNull(v: string | undefined, max: number): string | null {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    if (!trimmed) return null;
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function jsonError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function cors(response: Response): Response {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    return response;
}
