import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Free-tier daily limits (per user, rolling 24h unless noted). */
export const FREE_DAILY_LIMITS: Record<string, number> = {
    generate_flashcards: 3,
    generate_quiz: 3,
    podcast: 1,
    transcription: 1,
    summarize_transcript: 3,
};

/** Premium abuse caps (still enforced for paying users). */
export const PREMIUM_ABUSE_LIMITS: Record<string, number> = {
    generate_flashcards: 50,
    generate_quiz: 100,
    podcast: 5,
    transcription: 10,
    summarize_transcript: 50,
};

export const FREE_ASK_AI_PER_NOTE_DAY = 10;

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type RateLimitResult =
    | { allowed: true }
    | {
        allowed: false;
        status: 429;
        body: {
            error: "rate_limited";
            limit: number;
            tier: "free" | "premium";
            kind: string;
            retry_after_secs?: number;
        };
    };

export async function getIsPremium(
    admin: SupabaseClient,
    userId: string,
): Promise<boolean> {
    const { data, error } = await admin
        .from("profiles")
        .select("is_premium")
        .eq("user_id", userId)
        .maybeSingle();
    if (error || !data) return false;
    return data.is_premium === true;
}

function sinceIso(): string {
    return new Date(Date.now() - WINDOW_MS).toISOString();
}

async function countJobs(
    admin: SupabaseClient,
    userId: string,
    kind: string,
): Promise<number> {
    const { count, error } = await admin
        .from("ai_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", kind)
        .gte("created_at", sinceIso());
    if (error) throw new Error(`rate_check_failed: ${error.message}`);
    return count ?? 0;
}

/** Rolling 24h limit for a fixed `ai_jobs.kind`. */
export async function checkDailyJobLimit(
    admin: SupabaseClient,
    userId: string,
    kind: string,
): Promise<RateLimitResult> {
    const isPremium = await getIsPremium(admin, userId);
    const recent = await countJobs(admin, userId, kind);

    if (isPremium) {
        const cap = PREMIUM_ABUSE_LIMITS[kind];
        if (cap != null && recent >= cap) {
            return {
                allowed: false,
                status: 429,
                body: {
                    error: "rate_limited",
                    limit: cap,
                    tier: "premium",
                    kind,
                    retry_after_secs: 24 * 60 * 60,
                },
            };
        }
        return { allowed: true };
    }

    const freeLimit = FREE_DAILY_LIMITS[kind];
    if (freeLimit == null) return { allowed: true };
    if (recent >= freeLimit) {
        return {
            allowed: false,
            status: 429,
            body: {
                error: "rate_limited",
                limit: freeLimit,
                tier: "free",
                kind,
                retry_after_secs: 24 * 60 * 60,
            },
        };
    }
    return { allowed: true };
}

/** Summaries: count `summary_jobs` rows (deduped retries still count as one enqueue). */
export async function checkSummaryLimit(
    admin: SupabaseClient,
    userId: string,
): Promise<RateLimitResult> {
    const isPremium = await getIsPremium(admin, userId);
    const since = sinceIso();
    const { count, error } = await admin
        .from("summary_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since);
    if (error) throw new Error(`rate_check_failed: ${error.message}`);
    const recent = count ?? 0;

    if (isPremium) {
        const cap = PREMIUM_ABUSE_LIMITS.summarize_transcript;
        if (recent >= cap) {
            return {
                allowed: false,
                status: 429,
                body: {
                    error: "rate_limited",
                    limit: cap,
                    tier: "premium",
                    kind: "summarize_transcript",
                    retry_after_secs: 24 * 60 * 60,
                },
            };
        }
        return { allowed: true };
    }

    const freeLimit = FREE_DAILY_LIMITS.summarize_transcript;
    if (recent >= freeLimit) {
        return {
            allowed: false,
            status: 429,
            body: {
                error: "rate_limited",
                limit: freeLimit,
                tier: "free",
                kind: "summarize_transcript",
                retry_after_secs: 24 * 60 * 60,
            },
        };
    }
    return { allowed: true };
}

export function askAiJobKind(noteId: string): string {
    return `ask_ai_chat:${noteId}`;
}

/** Per-note chat: `ai_jobs.kind` = `ask_ai_chat:{noteId}`. */
export async function checkAskAiLimit(
    admin: SupabaseClient,
    userId: string,
    noteId: string,
    newUserMessages: number,
): Promise<RateLimitResult> {
    const kind = askAiJobKind(noteId);
    const isPremium = await getIsPremium(admin, userId);
    if (isPremium) return { allowed: true };

    const recent = await countJobs(admin, userId, kind);
    const limit = FREE_ASK_AI_PER_NOTE_DAY;
    if (recent + newUserMessages > limit) {
        return {
            allowed: false,
            status: 429,
            body: {
                error: "rate_limited",
                limit,
                tier: "free",
                kind: "ask_ai_chat",
                retry_after_secs: 24 * 60 * 60,
            },
        };
    }
    return { allowed: true };
}

export async function recordAskAiMessages(
    admin: SupabaseClient,
    userId: string,
    noteId: string,
    userMessageCount: number,
): Promise<void> {
    if (userMessageCount <= 0) return;
    const rows = Array.from({ length: userMessageCount }, () => ({
        user_id: userId,
        kind: askAiJobKind(noteId),
    }));
    await admin.from("ai_jobs").insert(rows);
}
