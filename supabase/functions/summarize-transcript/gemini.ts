const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Public pricing for Gemini 2.5 Flash (USD per 1M tokens). Update if Google changes pricing.
const INPUT_PRICE_PER_1M = 0.30;
const OUTPUT_PRICE_PER_1M = 2.50;

const TITLE_MAX_CHARS = 40;

export interface GeminiResult {
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

interface StructuredPayload {
    title?: unknown;
    icon?: unknown;
    markdown?: unknown;
}

export async function generateSummary(
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
): Promise<GeminiResult> {
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

    const response = await callWithRetry(ENDPOINT, apiKey, body);
    const data: GeminiResponse = await response.json();

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
            "Raise `maxOutputTokens` in gemini.ts or shorten the transcript.",
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
                "Shorten the source transcript or raise `maxOutputTokens` in gemini.ts.",
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

    // Cut at a stray ```json block opener (with or without leading newlines).
    // We only worry about it if it appears *after* a substantial chunk of
    // real content — the prompt forbids wrapping the whole body in a fence
    // anyway, so any json fence in the body is suspicious.
    const strayMatch = md.match(/\n[\s`]*```json[\s\S]*$/);
    if (strayMatch && strayMatch.index !== undefined && strayMatch.index > 200) {
        md = md.slice(0, strayMatch.index);
    }

    // Collapse any single run of >300 whitespace chars (Gemini stalling)
    // into a single blank line. Real markdown never has this.
    md = md.replace(/\s{300,}/g, "\n\n");

    return md.trim();
}

function sanitizeTitle(value: unknown): string {
    if (typeof value !== "string") return "";
    let t = value.trim().replace(/\s+/g, " ");
    // Strip wrapping quotes or trailing punctuation the model sometimes adds.
    t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
    t = t.replace(/[.!?;:,]+$/g, "");
    if (t.length > TITLE_MAX_CHARS) {
        // Truncate at the last word boundary within the limit.
        const cut = t.slice(0, TITLE_MAX_CHARS);
        const lastSpace = cut.lastIndexOf(" ");
        t = (lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trimEnd();
    }
    return t;
}

function sanitizeIcon(value: unknown): string {
    if (typeof value !== "string") return "";
    // Take the first grapheme — this collapses any accidental multi-emoji output
    // to a single glyph, including ZWJ sequences like "👨‍🏫".
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(value.trim()).containing(0)?.segment ?? "";
    return first;
}

async function callWithRetry(url: string, apiKey: string, body: unknown): Promise<Response> {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(`${url}?key=${apiKey}`, {
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
