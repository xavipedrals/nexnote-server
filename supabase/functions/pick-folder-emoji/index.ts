// pick-folder-emoji
// ---------------------------------------------------------------------------
// Given a folder name, asks Gemini 2.5 Flash to pick one emoji that best
// represents it, writes it to `folders.icon`, and returns it to the client so
// the UI can update without waiting for a realtime round trip.
//
// The client calls this asynchronously after creating a folder with no user-
// chosen emoji. While the request is in flight, the app shows a spinner in
// place of the folder icon.
//
// Required env vars (Supabase function secrets):
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - GEMINI_API_KEY
//
// Request body (JSON):
//   { "folderId": "<uuid>", "name": "Biology 101" }
//
// Response (JSON):
//   { "emoji": "🧬" }
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const GEMINI_MODEL = "gemini-3.1-flash-lite";

interface RequestBody {
    folderId: string;
    name: string;
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
    const name = (body.name ?? "").trim();
    if (!body.folderId || !name) {
        return cors(jsonError(400, "Missing fields: folderId, name"));
    }

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

    const { data: folder, error: folderErr } = await admin
        .from("folders")
        .select("user_id")
        .eq("id", body.folderId)
        .maybeSingle();
    if (folderErr) {
        return cors(jsonError(500, `Couldn't read folder: ${folderErr.message}`));
    }
    if (!folder) {
        return cors(jsonError(404, "Folder not found"));
    }
    if (folder.user_id !== userId) {
        return cors(jsonError(403, "Not your folder"));
    }

    let emoji: string;
    try {
        emoji = await pickEmojiWithGemini(name);
    } catch (e) {
        return cors(jsonError(502, `Emoji pick failed: ${(e as Error).message}`));
    }

    // Persist so other sessions / devices see the picked icon too. Ignore
    // update failures silently — the response still carries the emoji and
    // the client can retry later if it wants to.
    const { error: updErr } = await admin
        .from("folders")
        .update({ icon: emoji })
        .eq("id", body.folderId);
    if (updErr) {
        return cors(jsonError(500, `Couldn't save emoji: ${updErr.message}`));
    }

    return cors(jsonOk({ emoji }));
});

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

async function pickEmojiWithGemini(name: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const prompt =
        `Pick one emoji character that best represents a folder named "${name}".\n\n` +
        `Rules:\n` +
        `- Return exactly one emoji character.\n` +
        `- Prefer concrete, evocative emojis (e.g. 🧬 for "Biology", 💻 for "CS 401").\n` +
        `- Avoid generic folder/document icons unless nothing else fits.\n` +
        `- Never return text, letters, digits, or punctuation — only the emoji.\n` +
        `- Return strict JSON: { "emoji": string }. No preface, no code fences.`;

    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 64,
                thinkingConfig: { thinkingBudget: 0 },
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: { emoji: { type: "string" } },
                    required: ["emoji"],
                },
            },
        }),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini ${resp.status}: ${errText.slice(0, 300)}`);
    }

    const data = await resp.json();
    const raw: string = data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";
    if (!raw.trim()) {
        throw new Error("Gemini returned no text");
    }

    let parsed: { emoji?: unknown };
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Gemini returned non-JSON: ${(err as Error).message}`);
    }

    const candidate = typeof parsed.emoji === "string" ? parsed.emoji.trim() : "";
    const extracted = firstEmojiCluster(candidate);
    if (!extracted) {
        throw new Error("Gemini response didn't contain an emoji");
    }
    return extracted;
}

// Return the first grapheme cluster that is an emoji, trimming any trailing
// characters the model might have leaked. Uses Intl.Segmenter when available
// for correct ZWJ/VS16 handling.
function firstEmojiCluster(s: string): string | null {
    try {
        const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
        for (const { segment } of seg.segment(s)) {
            if (/\p{Extended_Pictographic}/u.test(segment)) return segment;
        }
    } catch {
        // Fall through to simple scan
    }
    for (const ch of s) {
        if (/\p{Extended_Pictographic}/u.test(ch)) return ch;
    }
    return null;
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
