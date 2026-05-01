// get-shared-note
// ---------------------------------------------------------------------------
// Public read-only endpoint that returns a shared note given a valid share
// link token. Called by the marketing-site Pages Function `/s/<token>`.
//
// Why this lives behind an edge function (rather than PostgREST + service
// role from Cloudflare):
//   - The service role key never leaves Supabase. The marketing-site only
//     ever holds the publishable key (the same one shipped in the iOS app),
//     so a CF compromise doesn't grant database-wide access.
//   - The API surface is narrow: token in, sanitized note JSON out. No way
//     to read other notes, list links, or write anything.
//
// Required env vars (auto-injected by Supabase for every function):
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Request: GET /functions/v1/get-shared-note?token=<token>
// Response (200): { "noteId", "title", "icon", "markdown", "displayLanguageCode" }
// Response (404): { "error": "not found" }   — revoked / expired / unknown
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Cap on how much markdown we return per request. Notes are usually a few
// kB, but a malicious giant `ai_summary` shouldn't burn worker memory or
// transfer time. If you have notes longer than this cap, raise it — the
// limit is purely a defensive guard.
const MAX_MARKDOWN_BYTES = 256 * 1024; // 256 KB

serve(async (req) => {
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (req.method !== "GET") return cors(jsonError(405, "Method not allowed"));

    const url = new URL(req.url);
    const token = (url.searchParams.get("token") ?? "").trim();
    if (!token) return cors(jsonError(400, "Missing token"));
    // Tokens are 32 random bytes base64url-encoded → 43 chars. We accept up
    // to 256 chars to leave headroom for future formats while still
    // rejecting obviously bogus input early.
    if (token.length > 256) return cors(jsonError(400, "Invalid token"));

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    const { data: link, error: linkErr } = await admin
        .from("note_share_links")
        .select("note_id, can_view, expires_at, revoked_at, max_uses, use_count")
        .eq("token", token)
        .maybeSingle();
    if (linkErr) {
        return cors(jsonError(500, `Couldn't look up share link: ${linkErr.message}`));
    }
    if (!link) return cors(jsonError(404, "not found"));
    if (link.revoked_at) return cors(jsonError(404, "not found"));
    if (!link.can_view) return cors(jsonError(404, "not found"));
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
        return cors(jsonError(404, "not found"));
    }
    if (link.max_uses != null && link.use_count >= link.max_uses) {
        return cors(jsonError(404, "not found"));
    }

    const { data: note, error: noteErr } = await admin
        .from("notes")
        .select("id, title, icon, ai_summary, display_language_code")
        .eq("id", link.note_id)
        .maybeSingle();
    if (noteErr) {
        return cors(jsonError(500, `Couldn't look up note: ${noteErr.message}`));
    }
    if (!note) return cors(jsonError(404, "not found"));

    let markdown = (note.ai_summary as string | null) ?? "";
    if (markdown.length > MAX_MARKDOWN_BYTES) {
        markdown = markdown.slice(0, MAX_MARKDOWN_BYTES);
    }

    return cors(jsonOk({
        noteId: note.id,
        title: (note.title as string | null) ?? "Untitled note",
        icon: (note.icon as string | null) ?? "📄",
        markdown,
        displayLanguageCode: (note.display_language_code as string | null) ?? null,
    }));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            // Don't cache — links can be revoked; downstream callers (the
            // CF Pages Function) decide their own caching.
            "Cache-Control": "no-store",
        },
    });
}

function jsonError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
    });
}

function cors(response: Response): Response {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    return response;
}
