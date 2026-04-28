// generate-quiz
// ---------------------------------------------------------------------------
// Generates a fixed-size MCQ + true/false quiz from a note's raw_transcript via
// Gemini 2.5 Flash. The function:
//   1. Inserts a `quizzes` row with status='generating' so the iOS client can
//      subscribe and show a loading screen immediately.
//   2. Calls Gemini once with the user's config (count + kinds + difficulty).
//   3. Inserts the generated `quiz_questions` rows.
//   4. Flips the quiz to status='ready' (or 'failed' if anything threw).
//
// Owner-only: shared viewers would need to clone_note first. The function does
// its own auth check (verify_jwt=false — iOS sends the publishable key when no
// user session is open).
//
// Knobs:
//   - MAX_QUESTION_COUNT       = 100
//   - MIN_CHARS_PER_QUESTION   = 200
//
// Rate limit: disabled for now — quiz generation is unmetered for everyone.
// The `ai_jobs` insert still records each call, so reinstating the gate is a
// pure code change.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.
// ---------------------------------------------------------------------------

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
    generateQuestions,
    QuizDifficulty,
    QuizQuestionType,
} from "./gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const MAX_QUESTION_COUNT = 100;
const MIN_CHARS_PER_QUESTION = 200;

const VALID_KINDS = new Set<QuizQuestionType>([
    "multiple_choice",
    "true_false",
]);
const VALID_DIFFICULTIES = new Set<QuizDifficulty>(["easy", "medium", "hard"]);

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
    noteId?: string;
    requestedCount?: number;
    kinds?: string[];
    difficulty?: string;
    title?: string;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: CORS });
    }
    if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return json({ error: "invalid_body" }, 400);
    }

    const noteId = body.noteId;
    const requestedCount = Number(body.requestedCount ?? 0);
    const kinds = Array.isArray(body.kinds) ? body.kinds : [];
    const difficulty = String(body.difficulty ?? "");
    const requestedTitle = typeof body.title === "string"
        ? body.title.trim().slice(0, 200)
        : "";

    if (!noteId || !Number.isFinite(requestedCount)) {
        return json({ error: "invalid_body" }, 400);
    }
    if (requestedCount < 1 || requestedCount > MAX_QUESTION_COUNT) {
        return json(
            { error: "count_out_of_range", max: MAX_QUESTION_COUNT },
            400,
        );
    }
    if (!VALID_DIFFICULTIES.has(difficulty as QuizDifficulty)) {
        return json({ error: "invalid_difficulty" }, 400);
    }
    const cleanedKinds = kinds
        .map((k) => String(k))
        .filter((k): k is QuizQuestionType =>
            VALID_KINDS.has(k as QuizQuestionType)
        );
    const dedupedKinds = Array.from(new Set(cleanedKinds));
    if (dedupedKinds.length === 0) {
        return json({ error: "invalid_kinds" }, 400);
    }
    const isMultipleChoice = dedupedKinds.includes("multiple_choice");
    const isTrueFalse = dedupedKinds.includes("true_false");

    // Identity check uses a user-scoped client; everything after that uses the
    // admin client so we can bypass RLS when inserting questions.
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

    // --- Note + ownership ----------------------------------------------------
    const { data: note, error: noteErr } = await admin
        .from("notes")
        .select("user_id, title, raw_transcript, display_language_code")
        .eq("id", noteId)
        .maybeSingle();
    if (noteErr) return json({ error: "note_lookup_failed" }, 500);
    if (!note) return json({ error: "note_not_found" }, 404);
    if (note.user_id !== userId) return json({ error: "not_owner" }, 403);

    const transcript = (note.raw_transcript ?? "").trim();
    const transcriptLen = transcript.length;
    const maxAllowed = Math.min(
        MAX_QUESTION_COUNT,
        Math.floor(transcriptLen / MIN_CHARS_PER_QUESTION),
    );
    if (requestedCount > maxAllowed) {
        return json(
            {
                error: "transcript_too_short",
                max_allowed: maxAllowed,
                requested: requestedCount,
            },
            400,
        );
    }

    // --- Rate limit ----------------------------------------------------------
    // Disabled for now — the quiz feature is unmetered for everyone while we
    // grow usage. The `ai_jobs` insert further down still records each call,
    // so re-enabling the gate later is a pure code change.

    // --- Insert the quiz row in 'generating' state ---------------------------
    const quizTitle = requestedTitle ||
        (typeof note.title === "string" && note.title.trim().length > 0
            ? note.title.trim().slice(0, 200)
            : "Quiz");

    const { data: quizRow, error: insertErr } = await admin
        .from("quizzes")
        .insert({
            note_id: noteId,
            user_id: userId,
            title: quizTitle,
            status: "generating",
            difficulty,
            is_multiple_choice: isMultipleChoice,
            is_true_false: isTrueFalse,
            requested_count: requestedCount,
            question_count: 0,
        })
        .select("id")
        .single();
    if (insertErr || !quizRow) {
        return json(
            {
                error: "quiz_create_failed",
                detail: stringify(insertErr ?? "no row returned").slice(0, 500),
            },
            500,
        );
    }
    const quizId: string = quizRow.id;

    // Record the rate-limit row regardless of outcome.
    await admin
        .from("ai_jobs")
        .insert({ user_id: userId, kind: "generate_quiz" });

    // --- Generate ------------------------------------------------------------
    try {
        const generated = await generateQuestions({
            transcript,
            languageName: languageNameFor(note.display_language_code),
            count: requestedCount,
            kinds: dedupedKinds,
            difficulty: difficulty as QuizDifficulty,
            apiKey: GEMINI_API_KEY,
        });

        if (generated.length === 0) {
            await failQuiz(admin, quizId, "no_questions_generated");
            return json({ error: "no_questions_generated" }, 500);
        }

        const rows = generated.map((q, idx) => ({
            quiz_id: quizId,
            user_id: userId,
            position: idx,
            type: q.type,
            question: q.question,
            options: q.options,
            correct_option: q.correct_option,
        }));
        const { error: questionsErr } = await admin
            .from("quiz_questions")
            .insert(rows);
        if (questionsErr) throw questionsErr;

        const { error: finalErr } = await admin
            .from("quizzes")
            .update({
                status: "ready",
                question_count: rows.length,
                generation_error: null,
            })
            .eq("id", quizId);
        if (finalErr) throw finalErr;

        return json({
            quiz_id: quizId,
            question_count: rows.length,
            requested_count: requestedCount,
        });
    } catch (e) {
        await failQuiz(admin, quizId, stringify(e));
        return json(
            { error: "generation_failed", detail: stringify(e).slice(0, 300) },
            500,
        );
    }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function failQuiz(
    admin: ReturnType<typeof createClient>,
    quizId: string,
    detail: string,
) {
    await admin
        .from("quizzes")
        .update({
            status: "failed",
            generation_error: detail.slice(0, 2000),
        })
        .eq("id", quizId);
}

function stringify(e: unknown): string {
    if (e instanceof Error) return e.message;
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}

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
