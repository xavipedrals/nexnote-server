// submit-report
// ---------------------------------------------------------------------------
// Public POST endpoint that accepts a content report from the marketing-site
// share-note view (`/s/<token>`) or the iOS share sheet's "Report" link.
//
// - No auth required: reporters may be anonymous third parties who arrived
//   via a public share link.
// - Validates the share token resolves to a real note (we won't accept reports
//   against arbitrary note ids submitted by hand).
// - Inserts into `public.note_reports` with the service role key (the table
//   has no insert policy, so only the service role can write).
// - If `RESEND_API_KEY` is configured, fires a notification email to
//   bestindieapps@gmail.com so reports surface promptly. Failure to send the
//   email does NOT fail the request — the DB row is the source of truth.
//
// Required env vars:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Optional env vars (email notification):
//   - RESEND_API_KEY      — send via https://resend.com
//   - REPORT_NOTIFY_EMAIL — override recipient (default: bestindieapps@gmail.com)
//   - REPORT_FROM_EMAIL   — From address (default: reports@nexnote.app)
//
// Request body (JSON):
//   {
//     "token": "<share token>",         // optional but strongly preferred
//     "noteId": "<uuid>",               // alternative to token
//     "reason": "copyright" | "harmful" | "inappropriate" | "privacy" | "spam" | "other",
//     "description": "<text>",          // optional
//     "reporterEmail": "<text>",        // optional
//     "reporterName": "<text>"          // optional
//   }
//
// Response: { "ok": true } on success, { "error": "..." } otherwise.
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REPORT_NOTIFY_EMAIL = Deno.env.get("REPORT_NOTIFY_EMAIL") ?? "bestindieapps@gmail.com";
const REPORT_FROM_EMAIL = Deno.env.get("REPORT_FROM_EMAIL") ?? "reports@nexnote.app";

const VALID_REASONS = new Set([
    "copyright",
    "harmful",
    "inappropriate",
    "privacy",
    "spam",
    "other",
]);

const MAX_DESCRIPTION = 4000;
const MAX_EMAIL = 254;
const MAX_NAME = 200;
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestBody {
    token?: string;
    noteId?: string;
    reason?: string;
    description?: string;
    reporterEmail?: string;
    reporterName?: string;
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

    const reason = (body.reason ?? "").trim().toLowerCase();
    if (!VALID_REASONS.has(reason)) {
        return cors(jsonError(400, "Invalid reason"));
    }
    const description = trimOrNull(body.description, MAX_DESCRIPTION);
    const reporterEmail = trimOrNull(body.reporterEmail, MAX_EMAIL);
    const reporterName = trimOrNull(body.reporterName, MAX_NAME);
    const token = trimOrNull(body.token, 256);
    const explicitNoteId = trimOrNull(body.noteId, 64);

    if (!token && !explicitNoteId) {
        return cors(jsonError(400, "Either token or noteId is required"));
    }
    if (explicitNoteId && !isValidUuid(explicitNoteId)) {
        return cors(jsonError(400, "Note ID is not valid"));
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    let noteId: string;
    try {
        noteId = await resolveReportNoteId(admin, token, explicitNoteId);
    } catch (e) {
        const err = e as ReportResolveError;
        return cors(jsonError(err.status, err.message));
    }

    const userAgent = req.headers.get("User-Agent")?.slice(0, 500) ?? null;

    const { data: inserted, error: insertErr } = await admin
        .from("note_reports")
        .insert({
            note_id: noteId,
            share_token: token,
            reason,
            description,
            reporter_email: reporterEmail,
            reporter_name: reporterName,
            user_agent: userAgent,
        })
        .select("id, created_at")
        .single();

    if (insertErr) {
        console.error("[submit-report] insert failed:", insertErr.message);
        return cors(jsonError(500, "Couldn't save report"));
    }

    // Fire-and-forget email notification. Failure here mustn't fail the
    // request — the DB row is the durable record.
    if (RESEND_API_KEY) {
        try {
            await sendNotificationEmail({
                reportId: inserted.id,
                noteId,
                reason,
                description,
                reporterEmail,
                reporterName,
                token,
            });
        } catch (e) {
            console.error("[submit-report] email send failed:", (e as Error).message);
        }
    }

    return cors(jsonOk({ ok: true, reportId: inserted.id }));
});

interface EmailParams {
    reportId: string;
    noteId: string;
    reason: string;
    description: string | null;
    reporterEmail: string | null;
    reporterName: string | null;
    token: string | null;
}

async function sendNotificationEmail(p: EmailParams): Promise<void> {
    const lines = [
        `<p><strong>New content report</strong></p>`,
        `<p>Reason: <code>${escapeHtml(p.reason)}</code></p>`,
        `<p>Note ID: <code>${escapeHtml(p.noteId)}</code></p>`,
        p.token ? `<p>Share token: <code>${escapeHtml(p.token)}</code></p>` : "",
        p.reporterName ? `<p>Reporter name: ${escapeHtml(p.reporterName)}</p>` : "",
        p.reporterEmail ? `<p>Reporter email: ${escapeHtml(p.reporterEmail)}</p>` : "",
        p.description
            ? `<p>Description:</p><pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;background:#F1F5F9;padding:12px;border-radius:8px;">${escapeHtml(p.description)}</pre>`
            : "",
        `<p style="color:#94A3B8;font-size:12px;">Report ID ${escapeHtml(p.reportId)}</p>`,
    ].filter(Boolean).join("\n");

    const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: REPORT_FROM_EMAIL,
            to: [REPORT_NOTIFY_EMAIL],
            reply_to: p.reporterEmail ?? undefined,
            subject: `[NuNotes report] ${p.reason} — note ${p.noteId.slice(0, 8)}`,
            html: lines,
        }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Resend ${resp.status}: ${text.slice(0, 300)}`);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class ReportResolveError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

async function resolveReportNoteId(
    admin: ReturnType<typeof createClient>,
    token: string | null,
    explicitNoteId: string | null,
): Promise<string> {
    if (token) {
        const { data: link, error: linkErr } = await admin
            .from("note_share_links")
            .select("note_id")
            .eq("token", token)
            .maybeSingle();
        if (linkErr) {
            console.error("[submit-report] share link lookup failed:", linkErr.message);
            throw new ReportResolveError(500, "Couldn't look up share link");
        }
        if (link) {
            const resolved = await fetchExistingNoteId(admin, link.note_id as string);
            if (resolved) return resolved;
            throw new ReportResolveError(404, "Note not found");
        }
        // Token missing from DB — fall back to an explicit note id when the
        // share page also embedded it (stale bookmark, rotated link, etc.).
        if (explicitNoteId) {
            const resolved = await fetchExistingNoteId(admin, explicitNoteId);
            if (resolved) return resolved;
            throw new ReportResolveError(404, "Note not found");
        }
        throw new ReportResolveError(404, "Share link not found");
    }

    const resolved = await fetchExistingNoteId(admin, explicitNoteId!);
    if (resolved) return resolved;
    throw new ReportResolveError(404, "Note not found");
}

async function fetchExistingNoteId(
    admin: ReturnType<typeof createClient>,
    noteId: string,
): Promise<string | null> {
    const { data: note, error: noteErr } = await admin
        .from("notes")
        .select("id")
        .eq("id", noteId)
        .maybeSingle();
    if (noteErr) {
        console.error("[submit-report] note lookup failed:", noteErr.message);
        throw new ReportResolveError(500, "Couldn't look up note");
    }
    return note ? (note.id as string) : null;
}

function isValidUuid(value: string): boolean {
    return UUID_RE.test(value);
}

function trimOrNull(v: string | undefined, max: number): string | null {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    if (!trimmed) return null;
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
