// Single Gemini call that returns up to `count` flashcards, avoiding any front
// already in `existingFronts` (normalized). Returns [] when the model signals
// saturation — the caller uses that as a stop signal.

const MODEL = "gemini-3.1-flash-lite";
const ENDPOINT =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Gemini struggles when the list of already-covered fronts grows unbounded —
// cap it. The dedup set on the server side still rejects any duplicates the
// LLM slips through.
const MAX_EXISTING_FRONTS_IN_PROMPT = 200;

export interface GeneratedCard {
    front: string;
    back: string;
}

export async function generateBatch(params: {
    transcript: string;
    languageName: string | null;
    existingFronts: string[];
    count: number;
    apiKey: string;
}): Promise<GeneratedCard[]> {
    const { transcript, languageName, existingFronts, count, apiKey } = params;

    const language = languageName?.trim() ||
        "the same language the transcript is in";

    // Only include the most recent fronts — older ones matter less because we
    // re-check on the server with the full normalized set.
    const truncatedFronts = existingFronts.slice(-MAX_EXISTING_FRONTS_IN_PROMPT);
    const existingBlock = truncatedFronts.length
        ? truncatedFronts.map((f) => `- ${f}`).join("\n")
        : "(none yet)";

    const systemPrompt =
        `You write study flashcards from source material.\n` +
        `\n` +
        `Rules:\n` +
        `- Each card covers exactly one atomic fact.\n` +
        `- Fronts are short questions or prompts; backs are concise answers (one sentence where possible).\n` +
        `- Do not repeat or rephrase any front that already exists in the provided list.\n` +
        `- Prefer facts not yet covered by the existing list.\n` +
        `- Skip trivia that isn't in the source — never invent content.\n` +
        `- Write every card in ${language}.\n` +
        `- If there's nothing substantive left to cover, return an empty array.\n` +
        `- Return strict JSON matching the schema: { "cards": [{ "front": string, "back": string }] }.`;

    const userPrompt =
        `Source transcript:\n` +
        `--- TRANSCRIPT ---\n` +
        `${transcript}\n` +
        `--- END TRANSCRIPT ---\n` +
        `\n` +
        `Existing card fronts (do not duplicate or rephrase):\n` +
        `${existingBlock}\n` +
        `\n` +
        `Generate up to ${count} new cards covering material not yet covered. ` +
        `If nothing meaningful is left, return { "cards": [] }.`;

    const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    cards: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                front: { type: "string" },
                                back: { type: "string" },
                            },
                            required: ["front", "back"],
                            propertyOrdering: ["front", "back"],
                        },
                    },
                },
                required: ["cards"],
            },
        },
    };

    const resp = await callWithRetry(ENDPOINT, apiKey, body);
    const data = await resp.json();

    if (data?.error) {
        throw new Error(
            `Gemini API error: ${data.error.message ?? data.error.status}`,
        );
    }

    const finishReason: string | undefined = data?.candidates?.[0]?.finishReason;
    const raw: string = data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";

    if (finishReason === "MAX_TOKENS") {
        throw new Error(
            "Flashcard batch hit the output-token cap. Lower the batch size.",
        );
    }

    if (!raw.trim()) {
        throw new Error(
            `Gemini returned no content (finishReason=${finishReason ?? "empty"})`,
        );
    }

    let parsed: { cards?: unknown };
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Gemini returned non-JSON: ${(err as Error).message}`);
    }

    const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
    const out: GeneratedCard[] = [];
    for (const c of cards) {
        if (typeof c !== "object" || c === null) continue;
        const front = typeof (c as GeneratedCard).front === "string"
            ? (c as GeneratedCard).front.trim()
            : "";
        const back = typeof (c as GeneratedCard).back === "string"
            ? (c as GeneratedCard).back.trim()
            : "";
        if (!front || !back) continue;
        out.push({ front, back });
    }
    return out;
}

async function callWithRetry(
    url: string,
    apiKey: string,
    body: unknown,
): Promise<Response> {
    const maxAttempts = 2;
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
                throw new Error(
                    `Gemini HTTP ${res.status}: ${text.slice(0, 500)}`,
                );
            }
        } catch (err) {
            lastError = err;
            if (attempt === maxAttempts) throw err;
        }
        await new Promise((r) => setTimeout(r, 750 * attempt));
    }
    throw lastError ?? new Error("Gemini call failed after retries");
}
