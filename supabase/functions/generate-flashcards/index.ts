// generate-flashcards
// ---------------------------------------------------------------------------
// Generates up to `target_count` flashcards from a note's raw_transcript via
// Gemini 2.5 Flash and appends them to the note's single AI-generated deck.
//
// Owner-only: shared viewers would need to clone_note first. The function
// does its own auth check (verify_jwt=false — iOS sends the publishable key
// when no user session is open).
//
// Knobs (see conversation / backend doc):
//   - MAX_TARGET_COUNT     = 500
//   - MIN_CHARS_PER_CARD   = 200
//   - STALE_LOCK_MINUTES   = 10    (how long a 'generating' status is honored
//                                   before we treat it as crashed)
//   - BATCH_SIZE           = 40
//   - LOW_YIELD_THRESHOLD  = 10    (batch considered low-yield if < this many
//                                   unique cards survive)
//   - DAILY_RATE_LIMIT     = 20    (calls per user per 24h window)
//
// Required env vars:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - GEMINI_API_KEY
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkDailyJobLimit } from "../_shared/premium.ts";
import { generateBatch } from "./gemini.ts";
import { normalizeFront } from "./dedup.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const MAX_TARGET_COUNT = 500;
const MIN_CHARS_PER_CARD = 200;
const STALE_LOCK_MINUTES = 10;
const BATCH_SIZE = 40;
const LOW_YIELD_THRESHOLD = 10;
const JOB_KIND = "generate_flashcards";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
    noteId?: string;
    targetCount?: number;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: CORS });
    }
    if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return json({ error: "unauthorized" }, 401);
    }

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return json({ error: "invalid_body" }, 400);
    }

    const noteId = body.noteId;
    const targetCount = Number(body.targetCount ?? 0);
    if (!noteId || !Number.isFinite(targetCount)) {
        return json({ error: "invalid_body" }, 400);
    }
    if (targetCount < 1 || targetCount > MAX_TARGET_COUNT) {
        return json(
            { error: "target_out_of_range", max: MAX_TARGET_COUNT },
            400,
        );
    }

    // Identity check uses a user-scoped client; everything after that uses the
    // admin client so we can bypass RLS when inserting cards / updating decks.
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
        return json({ error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    // --- Note + ownership ----------------------------------------------------
    const { data: note, error: noteErr } = await admin
        .from("notes")
        .select("user_id, raw_transcript, display_language_code")
        .eq("id", noteId)
        .maybeSingle();
    if (noteErr) return json({ error: "note_lookup_failed" }, 500);
    if (!note) return json({ error: "note_not_found" }, 404);
    if (note.user_id !== userId) return json({ error: "not_owner" }, 403);

    const transcript = (note.raw_transcript ?? "").trim();
    const transcriptLen = transcript.length;
    const maxAllowed = Math.min(
        MAX_TARGET_COUNT,
        Math.floor(transcriptLen / MIN_CHARS_PER_CARD),
    );
    if (targetCount > maxAllowed) {
        return json(
            {
                error: "transcript_too_short",
                max_allowed: maxAllowed,
                requested: targetCount,
            },
            400,
        );
    }

    // --- Rate limit ----------------------------------------------------------
    const rate = await checkDailyJobLimit(admin, userId, JOB_KIND);
    if (!rate.allowed) {
        return json(rate.body, rate.status);
    }

    // --- Resolve / create the single AI deck for this note -------------------
    let deckId: string;
    {
        const { data: existing, error: findErr } = await admin
            .from("flashcard_decks")
            .select("id, status, generation_started_at")
            .eq("note_id", noteId)
            .eq("is_ai_generated", true)
            .maybeSingle();
        if (findErr) return json({ error: "deck_lookup_failed" }, 500);

        if (existing) {
            deckId = existing.id;

            // Reject if another generation is actively running. Stale locks
            // (crashed runs) get auto-recycled.
            if (existing.status === "generating") {
                const startedAt = existing.generation_started_at
                    ? new Date(existing.generation_started_at).getTime()
                    : 0;
                const staleCutoff = Date.now() -
                    STALE_LOCK_MINUTES * 60 * 1000;
                if (startedAt > staleCutoff) {
                    return json({ error: "already_generating" }, 409);
                }
            }
        } else {
            const { data: created, error: insertErr } = await admin
                .from("flashcard_decks")
                .insert({
                    note_id: noteId,
                    user_id: userId,
                    name: "AI Generated",
                    is_ai_generated: true,
                    status: "idle",
                })
                .select("id")
                .single();
            if (insertErr || !created) {
                return json({ error: "deck_create_failed" }, 500);
            }
            deckId = created.id;
        }
    }

    // --- Claim the lock ------------------------------------------------------
    const { error: claimErr } = await admin
        .from("flashcard_decks")
        .update({
            status: "generating",
            generation_started_at: new Date().toISOString(),
            generation_error: null,
        })
        .eq("id", deckId);
    if (claimErr) return json({ error: "deck_claim_failed" }, 500);

    // Record the rate-limit row regardless of outcome.
    await admin
        .from("ai_jobs")
        .insert({ user_id: userId, kind: JOB_KIND });

    // --- Load existing fronts (dedup seed) -----------------------------------
    const seen = new Set<string>();
    const seenArray: string[] = []; // ordered for truncation in the prompt
    try {
        const { data: existingCards, error: cardsErr } = await admin
            .from("flashcards")
            .select("front")
            .eq("deck_id", deckId);
        if (cardsErr) throw cardsErr;
        for (const row of existingCards ?? []) {
            const key = normalizeFront(row.front ?? "");
            if (key && !seen.has(key)) {
                seen.add(key);
                seenArray.push(row.front);
            }
        }
    } catch (e) {
        await failDeck(admin, deckId, `load_existing_failed: ${stringify(e)}`);
        return json({ error: "load_existing_failed" }, 500);
    }

    // --- Batched generation loop --------------------------------------------
    let added = 0;
    let lowYieldStreak = 0;
    let saturated = false;

    try {
        while (added < targetCount) {
            const ask = Math.min(BATCH_SIZE, targetCount - added);
            const batch = await generateBatch({
                transcript,
                languageName: languageNameFor(note.display_language_code),
                existingFronts: seenArray,
                count: ask,
                apiKey: GEMINI_API_KEY,
            });

            if (batch.length === 0) {
                saturated = true;
                break; // model signaled nothing useful left
            }

            const unique = batch.filter((c) => {
                const k = normalizeFront(c.front);
                if (!k || seen.has(k)) return false;
                seen.add(k);
                seenArray.push(c.front);
                return true;
            });

            if (unique.length > 0) {
                const rows = unique.map((c) => ({
                    deck_id: deckId,
                    user_id: userId,
                    front: c.front,
                    back: c.back,
                }));
                const { error: insertErr } = await admin
                    .from("flashcards")
                    .insert(rows);
                if (insertErr) throw insertErr;
                added += unique.length;
            }

            if (unique.length < LOW_YIELD_THRESHOLD) {
                lowYieldStreak += 1;
                if (lowYieldStreak >= 2) {
                    saturated = true;
                    break;
                }
            } else {
                lowYieldStreak = 0;
            }
        }
    } catch (e) {
        await failDeck(admin, deckId, stringify(e));
        return json(
            { error: "generation_failed", detail: stringify(e).slice(0, 300) },
            500,
        );
    }

    // --- Finalize ------------------------------------------------------------
    // Must not return 500 here without flipping status: cards may already be
    // committed while the deck row still says `generating` (client banner
    // stuck forever). Retry a few times, then mark failed so stale-lock
    // + retry can recover.
    let finalErr: { message: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        const { error: err } = await admin
            .from("flashcard_decks")
            .update({
                status: "ready",
                generation_started_at: null,
                generation_error: null,
            })
            .eq("id", deckId);
        if (!err) {
            finalErr = null;
            break;
        }
        finalErr = err;
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
    if (finalErr) {
        await failDeck(
            admin,
            deckId,
            `finalize_failed after retries: ${finalErr.message}`,
        );
        return json({ error: "finalize_failed" }, 500);
    }

    return json({
        deck_id: deckId,
        cards_added: added,
        target_count: targetCount,
        saturated,
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function failDeck(
    admin: ReturnType<typeof createClient>,
    deckId: string,
    detail: string,
) {
    await admin
        .from("flashcard_decks")
        .update({
            status: "failed",
            generation_error: detail.slice(0, 2000),
            generation_started_at: null,
        })
        .eq("id", deckId);
}

function stringify(e: unknown): string {
    if (e instanceof Error) return e.message;
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}

// Map ISO 639-1 codes to names Gemini understands in the prompt. The fallback
// ("null") tells the LLM to match the transcript's language, which is what we
// want when `notes.display_language_code` has never been set.
function languageNameFor(code: string | null | undefined): string | null {
    if (!code) return null;
    const map: Record<string, string> = {
        en: "English",
        es: "Spanish",
        fr: "French",
        de: "German",
        it: "Italian",
        pt: "Portuguese",
        nl: "Dutch",
        ca: "Catalan",
        ja: "Japanese",
        ko: "Korean",
        zh: "Chinese",
        ru: "Russian",
        pl: "Polish",
        tr: "Turkish",
        ar: "Arabic",
        hi: "Hindi",
    };
    return map[code] ?? code;
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...CORS },
    });
}
