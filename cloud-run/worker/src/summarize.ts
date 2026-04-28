import { supabase, geminiKey } from "./clients.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";

interface Args {
    jobId: string;
    noteId: string;
    bucket: string;
    path: string;
}

// ~200k tokens; well under Gemini 2.5 Flash's 1M context.
const MAX_TRANSCRIPT_CHARS = 800_000;

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Public pricing for Gemini 2.5 Flash (USD per 1M tokens). Update if Google changes pricing.
const INPUT_PRICE_PER_1M = 0.30;
const OUTPUT_PRICE_PER_1M = 2.50;

const TITLE_MAX_CHARS = 40;

export async function runSummaryJob(args: Args): Promise<void> {
    const { jobId, noteId, bucket, path } = args;

    try {
        await supabase
            .from("summary_jobs")
            .update({ status: "processing", started_at: new Date().toISOString() })
            .eq("id", jobId);

        const { data: file, error: dlErr } = await supabase.storage
            .from(bucket)
            .download(path);
        if (dlErr || !file) {
            throw new Error(`storage_download_failed: ${dlErr?.message}`);
        }

        let transcript = (await file.text()).trim();
        if (!transcript) throw new Error("Transcript is empty");
        if (transcript.length > MAX_TRANSCRIPT_CHARS) {
            transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
        }

        const result = await generateSummary(SYSTEM_PROMPT, buildUserPrompt(transcript));

        await supabase
            .from("summary_jobs")
            .update({
                status: "complete",
                markdown: result.markdown,
                title: result.title,
                icon: result.icon,
                model: result.model,
                input_tokens: result.inputTokens,
                output_tokens: result.outputTokens,
                cost_usd: result.costUsd,
                completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);

        // Mirror onto the owning note so the iOS list + detail views flip from
        // "Generating…" to the real summary via Realtime. Title / icon replace
        // the placeholders the client wrote when it created the pending note.
        await supabase
            .from("notes")
            .update({
                title: result.title,
                icon: result.icon,
                ai_summary: result.markdown,
                summary_status: "ready",
                summary_error: null,
            })
            .eq("id", noteId);

        console.log(`summary ${jobId} ready`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`summary ${jobId} failed:`, message);
        await supabase
            .from("summary_jobs")
            .update({
                status: "failed",
                error: message.slice(0, 2000),
                completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        await supabase
            .from("notes")
            .update({
                summary_status: "failed",
                summary_error: message.slice(0, 2000),
            })
            .eq("id", noteId);
    }
}

// ---------------------------------------------------------------------------
// Gemini call + response sanitization
// ---------------------------------------------------------------------------

interface SummaryResult {
    title: string;
    icon: string;
    markdown: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    model: string;
}

interface GeminiResponse {
    candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
    };
    error?: { message?: string; status?: string };
}

async function generateSummary(systemPrompt: string, userPrompt: string): Promise<SummaryResult> {
    const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: 0.4,
            // 16384 is plenty for any reasonable study-note summary
            // (≈12 000–14 000 markdown chars). The previous 65535 cap was
            // tempting the model to ramble — at the high end Gemini would
            // sometimes finish the JSON's `markdown` value, then emit a wall
            // of whitespace and a stray ```json envelope opener inside the
            // same string field. Capping output keeps generations focused
            // and bounded.
            maxOutputTokens: 16384,
            // Structured-summary task doesn't need chain-of-thought; disabling
            // thinking keeps the full output budget available for the JSON.
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    icon: { type: "string" },
                    markdown: { type: "string" },
                },
                required: ["title", "icon", "markdown"],
                propertyOrdering: ["title", "icon", "markdown"],
            },
        },
    };

    const response = await callWithRetry(ENDPOINT, body);
    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
        throw new Error(`Gemini API error: ${data.error.message ?? data.error.status}`);
    }

    const finishReason = data.candidates?.[0]?.finishReason;
    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!raw.trim()) {
        throw new Error(`Gemini returned no content (finishReason: ${finishReason ?? "empty response"})`);
    }

    // MAX_TOKENS means Gemini hit the output cap mid-generation, so the JSON
    // is unterminated. Fail with an actionable message instead of a confusing
    // JSON.parse error. Raise `maxOutputTokens` if this recurs.
    if (finishReason === "MAX_TOKENS") {
        throw new Error(
            "Summary hit the output-token cap and was truncated. " +
            "Raise `maxOutputTokens` in summarize.ts or shorten the transcript.",
        );
    }

    const { title, icon, markdown } = parseStructuredPayload(raw);

    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    const costUsd =
        (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M +
        (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;

    return { title, icon, markdown, inputTokens, outputTokens, costUsd, model: MODEL };
}

interface StructuredPayload {
    title?: unknown;
    icon?: unknown;
    markdown?: unknown;
}

function parseStructuredPayload(raw: string): { title: string; icon: string; markdown: string } {
    let parsed: StructuredPayload;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        // Gemini occasionally truncates without setting finishReason=MAX_TOKENS.
        // If the payload doesn't close cleanly, surface the real cause instead
        // of the cryptic JSON parser message the user would otherwise see.
        if (!raw.trimEnd().endsWith("}")) {
            throw new Error(
                "Summary was truncated mid-response (Gemini hit its output-token cap). " +
                "Shorten the source transcript or raise `maxOutputTokens` in summarize.ts.",
            );
        }
        throw new Error(`Gemini returned non-JSON response: ${(err as Error).message}`);
    }

    const title = sanitizeTitle(parsed.title);
    const icon = sanitizeIcon(parsed.icon);
    const markdown = sanitizeMarkdown(parsed.markdown);

    if (!title) throw new Error("Gemini response missing `title`");
    if (!icon) throw new Error("Gemini response missing `icon`");
    if (!markdown) throw new Error("Gemini response missing `markdown`");

    return { title, icon, markdown };
}

/// Repairs the two failure modes we've seen Gemini fall into when it
/// over-generates inside a structured-output JSON string field:
///   1. A run of pure-whitespace padding hundreds of chars long.
///   2. A stray ```json envelope opener appearing well after the legitimate
///      markdown finishes — Gemini "restarting" the structured output inside
///      the markdown string.
/// Both are recoverable: the legitimate prefix is real content. We trim the
/// junk tail and keep what's useful.
function sanitizeMarkdown(value: unknown): string {
    if (typeof value !== "string") return "";
    let md = value;

    const strayMatch = md.match(/\n[\s`]*```json[\s\S]*$/);
    if (strayMatch && strayMatch.index !== undefined && strayMatch.index > 200) {
        md = md.slice(0, strayMatch.index);
    }

    md = md.replace(/\s{300,}/g, "\n\n");

    return md.trim();
}

function sanitizeTitle(value: unknown): string {
    if (typeof value !== "string") return "";
    let t = value.trim().replace(/\s+/g, " ");
    t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
    t = t.replace(/[.!?;:,]+$/g, "");
    if (t.length > TITLE_MAX_CHARS) {
        const cut = t.slice(0, TITLE_MAX_CHARS);
        const lastSpace = cut.lastIndexOf(" ");
        t = (lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trimEnd();
    }
    return t;
}

function sanitizeIcon(value: unknown): string {
    if (typeof value !== "string") return "";
    // Take the first grapheme — collapses any accidental multi-emoji output
    // to a single glyph, including ZWJ sequences like "👨‍🏫".
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(value.trim()).containing(0)?.segment ?? "";
    return first;
}

async function callWithRetry(url: string, body: unknown): Promise<Response> {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(`${url}?key=${geminiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) return res;

            const retryable = res.status === 429 || res.status >= 500;
            if (!retryable || attempt === maxAttempts) {
                const text = await res.text();
                throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 500)}`);
            }
        } catch (err) {
            lastError = err;
            if (attempt === maxAttempts) throw err;
        }

        // Exponential backoff with jitter: 1s, 2s, 4s +/- 250ms
        const delay = 1000 * 2 ** (attempt - 1) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
    }

    throw lastError ?? new Error("Gemini call failed after retries");
}
