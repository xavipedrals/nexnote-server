// translate-summary
// ---------------------------------------------------------------------------
// Translates a note's `ai_summary` (markdown) into the requested language
// using Gemini 2.5 Flash and writes the result back to the same `ai_summary`
// column. Also sets `notes.display_language_code` so future flashcard / quiz /
// podcast generators can prompt the LLM in the same language.
//
// Owner-only: shared viewers can't overwrite someone else's summary. If a
// shared viewer wants a translation, they should `clone_note` first and
// translate their own copy.
//
// Required env vars (Supabase function secrets):
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - GEMINI_API_KEY
//
// Request body (JSON):
//   { "noteId": "<uuid>", "langCode": "es", "langName": "Spanish" }
//
// Response (JSON):
//   { "translated": "<markdown>" }
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

// Best cost-to-quality model for translation. 2.5 Flash handles long markdown
// with good fidelity at ~$0.30 / 1M input tokens.
const GEMINI_MODEL = "gemini-3.1-flash-lite";

interface RequestBody {
    noteId: string;
    langCode: string;
    langName: string;
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
    if (!body.noteId || !body.langCode || !body.langName) {
        return cors(jsonError(400, "Missing fields: noteId, langCode, langName"));
    }

    // User-scoped client — used once to verify identity, then we switch to
    // the admin client because we need to UPDATE notes.ai_summary which is
    // gated by owner-only RLS.
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
        return cors(jsonError(401, "Invalid session"));
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    // Fetch the note. Admin client so we can read owner_id without tripping RLS.
    const { data: note, error: noteErr } = await admin
        .from("notes")
        .select("user_id, title, ai_summary, display_language_code")
        .eq("id", body.noteId)
        .maybeSingle();
    if (noteErr) {
        return cors(jsonError(500, `Couldn't read note: ${noteErr.message}`));
    }
    if (!note) {
        return cors(jsonError(404, "Note not found"));
    }
    if (note.user_id !== userId) {
        // Translate-in-place changes the canonical summary. Only the owner
        // can do that; shared viewers should clone first.
        return cors(jsonError(403, "Only the note owner can translate its summary"));
    }

    const summary = (note.ai_summary ?? "").trim();
    const originalTitle = (note.title ?? "").trim();
    if (!summary) {
        return cors(jsonError(404, "Note has no summary to translate"));
    }

    // No-op: already in the requested language. Skip the LLM call.
    if (note.display_language_code === body.langCode) {
        return cors(jsonOk({ title: originalTitle, markdown: summary }));
    }

    // Translate both fields in a single Gemini call via structured output.
    let translated: { title: string; markdown: string };
    try {
        translated = await translateWithGemini(originalTitle, summary, body.langName);
    } catch (e) {
        return cors(jsonError(502, `Translation failed: ${(e as Error).message}`));
    }

    // Write back. This is the destructive step — the previous title +
    // ai_summary are gone. That's intentional: users didn't want the
    // original language in the first place.
    const { error: updErr } = await admin
        .from("notes")
        .update({
            title: translated.title,
            ai_summary: translated.markdown,
            display_language_code: body.langCode,
        })
        .eq("id", body.noteId);
    if (updErr) {
        return cors(jsonError(500, `Couldn't save translation: ${updErr.message}`));
    }

    return cors(jsonOk(translated));
});

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

async function translateWithGemini(
    originalTitle: string,
    markdown: string,
    langName: string,
): Promise<{ title: string; markdown: string }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const prompt =
        `Translate the note title and the Markdown body below into ${langName}.\n` +
        `\n` +
        `Rules:\n` +
        `- Preserve every Markdown construct in the body: headings, lists, tables, code blocks, links, emphasis, blockquotes.\n` +
        `- Do not translate code, URLs, file paths, or identifiers inside code spans/blocks.\n` +
        `- Do not translate proper nouns that are not normally translated (people, products, brands).\n` +
        `- Keep the title concise and natural in ${langName}; don't wrap it in quotes.\n` +
        `- If the title is empty, return an empty string for the title.\n` +
        `- Return strict JSON matching the schema: { "title": string, "markdown": string }. No extra keys, no preface, no code fences.\n` +
        `\n` +
        `--- TITLE ---\n` +
        `${originalTitle}\n` +
        `--- END TITLE ---\n` +
        `\n` +
        `--- MARKDOWN ---\n` +
        `${markdown}\n` +
        `--- END MARKDOWN ---`;

    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                // 2.5 Flash supports up to 65535 output tokens. Keep headroom
                // for long note summaries — translated markdown rarely expands
                // beyond ~1.5x the source.
                maxOutputTokens: 32768,
                // Disable thinking so the full output budget goes to the JSON.
                thinkingConfig: { thinkingBudget: 0 },
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        markdown: { type: "string" },
                    },
                    required: ["title", "markdown"],
                    propertyOrdering: ["title", "markdown"],
                },
            },
        }),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini ${resp.status}: ${errText.slice(0, 300)}`);
    }

    const data = await resp.json();
    const candidate = data?.candidates?.[0];
    const finishReason: string | undefined = candidate?.finishReason;

    if (finishReason === "MAX_TOKENS") {
        throw new Error(
            "Translation hit the output-token cap and was truncated. " +
            "Raise maxOutputTokens in translate-summary/index.ts or shorten the note.",
        );
    }

    const raw: string = candidate?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";
    if (!raw.trim()) {
        throw new Error(`Gemini returned no text (finishReason=${finishReason ?? "unknown"})`);
    }

    let parsed: { title?: unknown; markdown?: unknown };
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Gemini returned non-JSON: ${(err as Error).message}`);
    }

    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const mdOut = typeof parsed.markdown === "string" ? parsed.markdown.trim() : "";
    if (!mdOut) {
        throw new Error("Gemini response missing `markdown`");
    }
    // Fall back to the original title if the model returned nothing usable.
    return {
        title: title || originalTitle,
        markdown: mdOut,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
