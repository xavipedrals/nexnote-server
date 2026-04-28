// Single Gemini call that returns up to `count` quiz questions of the requested
// kinds and difficulty. The caller persists the rows verbatim — this module
// only generates and validates shape.
//
// We ask for OPTIONS = ["a","b","c","d"] for multiple_choice and ["a","b"] for
// true_false, with `correct_option` always one of those letters. That lines up
// with the schema (`quiz_questions.correct_option text`) without any post-LLM
// remapping.

const MODEL = "gemini-2.5-flash";
const ENDPOINT =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type QuizQuestionType = "multiple_choice" | "true_false";
export type QuizDifficulty = "easy" | "medium" | "hard";

export interface GeneratedQuestion {
    type: QuizQuestionType;
    question: string;
    options: { id: string; text: string }[];
    correct_option: string; // "a" | "b" | "c" | "d"
}

export async function generateQuestions(params: {
    transcript: string;
    languageName: string | null;
    count: number;
    kinds: QuizQuestionType[];
    difficulty: QuizDifficulty;
    apiKey: string;
}): Promise<GeneratedQuestion[]> {
    const { transcript, languageName, count, kinds, difficulty, apiKey } =
        params;

    const language = languageName?.trim() ||
        "the same language the transcript is in";

    const allowsMC = kinds.includes("multiple_choice");
    const allowsTF = kinds.includes("true_false");

    const kindRule = (() => {
        if (allowsMC && allowsTF) {
            return "Mix question types: roughly half multiple_choice (4 options each) and half true_false (2 options: True / False). Use true_false where the fact has a clear binary truth, multiple_choice otherwise.";
        }
        if (allowsMC) {
            return "All questions must be multiple_choice with exactly 4 options.";
        }
        return "All questions must be true_false with exactly 2 options (True, False).";
    })();

    const difficultyRule = (() => {
        switch (difficulty) {
            case "easy":
                return "Easy difficulty: test recall of clearly stated facts. Distractors should be obviously wrong.";
            case "hard":
                return "Hard difficulty: test analysis, application, and subtle distinctions. Distractors should be plausible and require careful reading.";
            default:
                return "Medium difficulty: test comprehension and inference. Distractors should be plausible but distinguishable on a careful read.";
        }
    })();

    const systemPrompt =
        `You write multiple-choice and true/false quiz questions from source material.\n` +
        `\n` +
        `Rules:\n` +
        `- Every question must be answerable from the source transcript — never invent facts.\n` +
        `- ${kindRule}\n` +
        `- ${difficultyRule}\n` +
        `- For multiple_choice: provide exactly 4 options with ids "a","b","c","d", in that order. Set correct_option to one of "a","b","c","d".\n` +
        `- For true_false: provide exactly 2 options, [{"id":"a","text":"True"},{"id":"b","text":"False"}]. The question must be a single declarative statement that is unambiguously true or false. Set correct_option to "a" if true, "b" if false.\n` +
        `- Do not repeat questions or paraphrase the same fact across questions.\n` +
        `- Write every question and option in ${language}. Translate "True"/"False" if the language is not English.\n` +
        `- Return strict JSON matching the schema: { "questions": [...] }.`;

    const userPrompt =
        `Source transcript:\n` +
        `--- TRANSCRIPT ---\n` +
        `${transcript}\n` +
        `--- END TRANSCRIPT ---\n` +
        `\n` +
        `Generate exactly ${count} quiz questions following all rules. ` +
        `If the transcript does not have enough substance for ${count} questions, return as many as you reasonably can.`;

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
                    questions: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                type: {
                                    type: "string",
                                    enum: ["multiple_choice", "true_false"],
                                },
                                question: { type: "string" },
                                options: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string" },
                                            text: { type: "string" },
                                        },
                                        required: ["id", "text"],
                                        propertyOrdering: ["id", "text"],
                                    },
                                },
                                correct_option: { type: "string" },
                            },
                            required: [
                                "type",
                                "question",
                                "options",
                                "correct_option",
                            ],
                            propertyOrdering: [
                                "type",
                                "question",
                                "options",
                                "correct_option",
                            ],
                        },
                    },
                },
                required: ["questions"],
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
            "Quiz generation hit the output-token cap. Lower the requested count.",
        );
    }
    if (!raw.trim()) {
        throw new Error(
            `Gemini returned no content (finishReason=${finishReason ?? "empty"})`,
        );
    }

    let parsed: { questions?: unknown };
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Gemini returned non-JSON: ${(err as Error).message}`);
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const out: GeneratedQuestion[] = [];
    for (const q of questions) {
        const cleaned = sanitize(q, kinds);
        if (cleaned) out.push(cleaned);
    }
    return out;
}

function sanitize(
    raw: unknown,
    allowedKinds: QuizQuestionType[],
): GeneratedQuestion | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;

    const type = r.type;
    if (type !== "multiple_choice" && type !== "true_false") return null;
    if (!allowedKinds.includes(type)) return null;

    const question = typeof r.question === "string" ? r.question.trim() : "";
    if (!question) return null;

    const rawOptions = Array.isArray(r.options) ? r.options : [];
    const cleanedOptions: { id: string; text: string }[] = [];
    for (const o of rawOptions) {
        if (typeof o !== "object" || o === null) continue;
        const oo = o as Record<string, unknown>;
        const id = typeof oo.id === "string" ? oo.id.trim().toLowerCase() : "";
        const text = typeof oo.text === "string" ? oo.text.trim() : "";
        if (!id || !text) continue;
        cleanedOptions.push({ id, text });
    }

    const expected = type === "multiple_choice" ? 4 : 2;
    if (cleanedOptions.length !== expected) return null;

    const validIds = type === "multiple_choice"
        ? new Set(["a", "b", "c", "d"])
        : new Set(["a", "b"]);
    for (const o of cleanedOptions) {
        if (!validIds.has(o.id)) return null;
    }

    const correct = typeof r.correct_option === "string"
        ? r.correct_option.trim().toLowerCase()
        : "";
    if (!validIds.has(correct)) return null;

    return {
        type,
        question,
        options: cleanedOptions,
        correct_option: correct,
    };
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
