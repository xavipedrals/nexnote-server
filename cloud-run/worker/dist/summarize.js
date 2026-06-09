import { supabase, geminiKey } from "./clients.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
// ~200k tokens; well under Gemini 3.1 Flash Lite's context window.
const MAX_TRANSCRIPT_CHARS = 800_000;
const MODEL = "gemini-3.1-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
// Public pricing for Gemini 3.1 Flash Lite (USD per 1M tokens). Update if Google changes pricing.
const INPUT_PRICE_PER_1M = 0.25;
const OUTPUT_PRICE_PER_1M = 0.50;
const TITLE_MAX_CHARS = 40;
export async function runSummaryJob(args) {
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
        if (!transcript)
            throw new Error("Transcript is empty");
        if (transcript.length > MAX_TRANSCRIPT_CHARS) {
            transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
        }
        const { prompt: userPrompt, budget } = buildUserPrompt(transcript);
        const result = await generateValidatedSummary(SYSTEM_PROMPT, userPrompt, budget);
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
        //
        // We also seed `display_language_code` with whatever language Gemini
        // detected the source content in. This is what the summary is written
        // in too, so it's the right starting point for downstream features
        // (podcast / quiz / flashcard generators read this column to match
        // the user's reading language). `translate-summary` overwrites it
        // later if the user explicitly translates.
        //
        // The `.in("summary_status", ...)` guard is what prevents a stale
        // worker from clobbering a result another concurrent run already
        // landed. If two retries fire (user double-tapped, network retry,
        // etc.), both kick separate worker runs that read the note in
        // parallel; whichever finishes first writes its result and flips
        // status to `ready`. A second, later finisher would then see
        // `summary_status='ready'`, the filter would not match, and the
        // late write becomes a no-op — exactly what we want. We allow
        // `failed` here too so a slow successful retry can rescue a note
        // that an earlier run had marked failed.
        const noteUpdate = {
            title: result.title,
            icon: result.icon,
            ai_summary: result.markdown,
            summary_status: "ready",
            summary_error: null,
        };
        if (result.languageCode) {
            noteUpdate.display_language_code = result.languageCode;
        }
        await supabase
            .from("notes")
            .update(noteUpdate)
            .eq("id", noteId)
            .in("summary_status", ["processing", "failed"]);
        console.log(`summary ${jobId} ready`);
    }
    catch (err) {
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
        // Only mark the note as failed if it's still `processing`. A
        // concurrent successful retry may have already flipped it to
        // `ready`; we must not clobber that with a stale failure. The
        // matching iOS-side guard is the same `.eq("summary_status",
        // "processing")` in `failStaleProcessingNotes`.
        await supabase
            .from("notes")
            .update({
            summary_status: "failed",
            summary_error: message.slice(0, 2000),
        })
            .eq("id", noteId)
            .eq("summary_status", "processing");
    }
}
function validateMarkdown(md, budget) {
    const overshoot = Math.round(budget.hardMax * 1.5);
    if (md.length > overshoot) {
        return {
            code: "too_long",
            detail: `markdown is ${md.length} chars, hardMax was ${budget.hardMax}`,
        };
    }
    for (const line of md.split("\n")) {
        if (line.length > 2_000) {
            return {
                code: "long_line",
                detail: `line of ${line.length} chars`,
            };
        }
    }
    const repeat = md.match(/(\S)\1{30,}/);
    if (repeat) {
        return {
            code: "repeating_chars",
            detail: `run of '${repeat[1]}' x ${repeat[0].length}`,
        };
    }
    return null;
}
/// Runs `generateSummary`, validates the output, and retries once if the
/// first attempt looks malformed. The retry uses the same prompt and params
/// — at temperature 0.4 the next sample diverges from the loop state that
/// produced the garbage. Two attempts keeps cost bounded: ≥99 % of calls
/// succeed on the first try, so the average overhead is small even though
/// the worst case doubles tokens.
///
/// If both attempts fail validation we throw, which lands in
/// `runSummaryJob`'s catch block and surfaces as a user-visible failure
/// they can retry from the UI. Better than shipping a wall of dashes.
async function generateValidatedSummary(systemPrompt, userPrompt, budget) {
    const MAX_ATTEMPTS = 2;
    let lastIssue = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const result = await generateSummary(systemPrompt, userPrompt);
        const issue = validateMarkdown(result.markdown, budget);
        if (!issue) {
            if (attempt > 1) {
                console.log(`summary recovered on attempt ${attempt}`);
            }
            return result;
        }
        console.warn(`summary validation failed (attempt ${attempt}/${MAX_ATTEMPTS}): ` +
            `${issue.code} — ${issue.detail}`);
        lastIssue = issue;
    }
    throw new Error(`Summary failed validation after ${MAX_ATTEMPTS} attempts: ` +
        `${lastIssue?.code} — ${lastIssue?.detail}`);
}
async function generateSummary(systemPrompt, userPrompt) {
    const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: 0.4,
            // 24576 is a safety net for dense academic content (especially
            // Spanish / Portuguese, which run ~20 % more tokens per char than
            // English) where Gemini occasionally over-produces despite the
            // prompt's length cap. The prompt itself is the primary throttle —
            // see `prompt.ts` for the per-call markdown character target.
            // Cap is well below the model's max output limit; raising it
            // higher tempted the model to ramble and corrupt the structured
            // JSON output (whitespace walls, stray ```json fences inside the
            // markdown string).
            maxOutputTokens: 24576,
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
                    language_code: { type: "string" },
                },
                required: ["title", "icon", "markdown", "language_code"],
                propertyOrdering: ["title", "icon", "markdown", "language_code"],
            },
        },
    };
    const response = await callWithRetry(ENDPOINT, body);
    const data = (await response.json());
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
        throw new Error("Summary hit the output-token cap and was truncated. " +
            "Raise `maxOutputTokens` in summarize.ts or shorten the transcript.");
    }
    const { title, icon, markdown, languageCode } = parseStructuredPayload(raw);
    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    const costUsd = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M +
        (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;
    return { title, icon, markdown, languageCode, inputTokens, outputTokens, costUsd, model: MODEL };
}
function parseStructuredPayload(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        // Gemini occasionally truncates without setting finishReason=MAX_TOKENS.
        // If the payload doesn't close cleanly, surface the real cause instead
        // of the cryptic JSON parser message the user would otherwise see.
        if (!raw.trimEnd().endsWith("}")) {
            throw new Error("Summary was truncated mid-response (Gemini hit its output-token cap). " +
                "Shorten the source transcript or raise `maxOutputTokens` in summarize.ts.");
        }
        throw new Error(`Gemini returned non-JSON response: ${err.message}`);
    }
    const title = sanitizeTitle(parsed.title);
    const icon = sanitizeIcon(parsed.icon);
    const markdown = sanitizeMarkdown(parsed.markdown);
    const languageCode = sanitizeLanguageCode(parsed.language_code);
    if (!title)
        throw new Error("Gemini response missing `title`");
    if (!icon)
        throw new Error("Gemini response missing `icon`");
    if (!markdown)
        throw new Error("Gemini response missing `markdown`");
    return { title, icon, markdown, languageCode };
}
/// Repairs failure modes we've seen Gemini fall into when it
/// over-generates inside a structured-output JSON string field:
///   1. A run of pure-whitespace padding hundreds of chars long.
///   2. A stray ```json envelope opener appearing well after the legitimate
///      markdown finishes — Gemini "restarting" the structured output inside
///      the markdown string.
///   3. A run of the same non-whitespace character repeated dozens / thousands
///      of times — classic autoregressive token-loop pathology, most often a
///      markdown table separator row (`|:------------…------|`) where the
///      decoder gets stuck on `-`. Even at 31 chars a single-char run is
///      essentially never legitimate (markdown HRs / table separators use 3),
///      so we collapse anything ≥31 to 3 of that char.
/// All three are recoverable: the legitimate prefix is real content. We trim
/// junk and keep what's useful.
function sanitizeMarkdown(value) {
    if (typeof value !== "string")
        return "";
    let md = value;
    const strayMatch = md.match(/\n[\s`]*```json[\s\S]*$/);
    if (strayMatch && strayMatch.index !== undefined && strayMatch.index > 200) {
        md = md.slice(0, strayMatch.index);
    }
    md = md.replace(/\s{300,}/g, "\n\n");
    // Collapse 31+ identical non-whitespace chars down to 3. The capture
    // group is the repeated char; the replacement re-emits it three times.
    md = md.replace(/(\S)\1{30,}/g, "$1$1$1");
    return md.trim();
}
function sanitizeTitle(value) {
    if (typeof value !== "string")
        return "";
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
function sanitizeIcon(value) {
    if (typeof value !== "string")
        return "";
    // Take the first grapheme — collapses any accidental multi-emoji output
    // to a single glyph, including ZWJ sequences like "👨‍🏫".
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(value.trim()).containing(0)?.segment ?? "";
    return first;
}
/// Accepts only well-formed ISO 639-1 (2-letter) or 639-2/3 (3-letter)
/// language codes, lowercased. Anything else returns null so the caller
/// leaves `notes.display_language_code` untouched rather than poisoning the
/// column with junk like "english" or "en-US-fr".
function sanitizeLanguageCode(value) {
    if (typeof value !== "string")
        return null;
    const normalized = value.trim().toLowerCase();
    return /^[a-z]{2,3}$/.test(normalized) ? normalized : null;
}
async function callWithRetry(url, body) {
    const maxAttempts = 3;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(`${url}?key=${geminiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok)
                return res;
            const retryable = res.status === 429 || res.status >= 500;
            if (!retryable || attempt === maxAttempts) {
                const text = await res.text();
                throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 500)}`);
            }
        }
        catch (err) {
            lastError = err;
            if (attempt === maxAttempts)
                throw err;
        }
        // Exponential backoff with jitter: 1s, 2s, 4s +/- 250ms
        const delay = 1000 * 2 ** (attempt - 1) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
    }
    throw lastError ?? new Error("Gemini call failed after retries");
}
//# sourceMappingURL=summarize.js.map