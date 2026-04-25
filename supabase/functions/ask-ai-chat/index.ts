// ask-ai-chat
// ---------------------------------------------------------------------------
// Streams an OpenAI chat completion back to the iOS client, grounded in the
// content of a single note. The client sends only `{ noteId, messages }`; the
// function fetches the note's title + summary itself, using the caller's
// Authorization header so RLS (including shared-note access) is respected.
//
// The OpenAI SSE stream is piped through unchanged — the client parses
// `data: {...}` lines and extracts `choices[0].delta.content`.
//
// verify_jwt is disabled at the gateway (iOS sends the publishable key rather
// than a JWT). Identity is verified in-function via `userClient.auth.getUser()`.
//
// Required env vars (Supabase function secrets):
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY   (used for the identity check client)
//   - OPENAI_API_KEY
//
// Request body (JSON):
//   {
//     "noteId":   "<uuid>",
//     "messages": [{ "role": "user" | "assistant", "content": "..." }, ...]
//   }
//
// Response: text/event-stream (OpenAI chat completion deltas).
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const MODEL = "gpt-4o-mini";
const MAX_CONTEXT_CHARS = 24_000; // guardrail; trims long notes before prompting

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

interface RequestBody {
    noteId: string;
    messages: ChatMessage[];
}

serve(async (req) => {
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (req.method !== "POST") return cors(jsonError(405, "Method not allowed"));

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return cors(jsonError(401, "Missing Authorization header"));

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return cors(jsonError(400, "Invalid JSON body"));
    }
    if (!body.noteId || !Array.isArray(body.messages) || body.messages.length === 0) {
        return cors(jsonError(400, "Missing fields: noteId, messages"));
    }

    // Caller-scoped client — RLS-enforced. If the user can't read this note,
    // the query returns no rows and we 404 below. No separate access check.
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
        return cors(jsonError(401, "Invalid session"));
    }

    const { data: note, error: noteErr } = await userClient
        .from("notes")
        .select("title, ai_summary, display_language_code")
        .eq("id", body.noteId)
        .maybeSingle();
    if (noteErr) {
        return cors(jsonError(500, `Couldn't read note: ${noteErr.message}`));
    }
    if (!note) {
        return cors(jsonError(404, "Note not found or not accessible"));
    }

    const title = (note.title ?? "").trim();
    const summary = (note.ai_summary ?? "").trim();
    const lang = note.display_language_code ?? null;

    const systemPrompt = buildSystemPrompt(title, summary, lang);
    const sanitized = body.messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: m.content }));

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: MODEL,
            stream: true,
            max_tokens: 1000,
            temperature: 0.7,
            messages: [
                { role: "system", content: systemPrompt },
                ...sanitized,
            ],
        }),
    });

    if (!openAiResponse.ok || !openAiResponse.body) {
        const errText = await openAiResponse.text().catch(() => "");
        return cors(jsonError(openAiResponse.status || 502, `OpenAI error: ${errText.slice(0, 300)}`));
    }

    return cors(new Response(openAiResponse.body, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
        },
    }));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSystemPrompt(title: string, summary: string, lang: string | null): string {
    const trimmed = summary.length > MAX_CONTEXT_CHARS
        ? summary.slice(0, MAX_CONTEXT_CHARS) + "\n\n…[truncated]"
        : summary;
    const languageLine = lang
        ? `The note is written in language code "${lang}". Reply in the same language unless the user asks otherwise.`
        : "Reply in the same language the user is writing in.";

    return [
        "You are a study assistant embedded in a note-taking app called Nexnote.",
        "The user is reading a specific note and asking questions about it.",
        languageLine,
        "Be concise and clear. Use Markdown for structure when helpful —",
        "bold, bullet lists, numbered lists, headings, code blocks.",
        "Ground your answers in the note content below. If the note doesn't",
        "cover the question, say so briefly and answer from general knowledge.",
        "",
        `--- NOTE TITLE ---`,
        title || "(untitled)",
        `--- END TITLE ---`,
        "",
        `--- NOTE SUMMARY (Markdown) ---`,
        trimmed || "(this note has no summary yet)",
        `--- END SUMMARY ---`,
    ].join("\n");
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
