import { sendPodcastReadyPushIfNeeded } from "./apns.js";
import { supabase, xaiKey, geminiKey, voices } from "./clients.js";
const GEMINI_MODEL = "gemini-2.5-flash";
// Progress checkpoints (0–100). TTS dominates wall-clock time so it gets
// the largest share. iOS reads `progress_percent` over Realtime and renders
// a ProgressView while status='generating'.
const PROGRESS_LOADED = 5;
const PROGRESS_SCRIPT_DONE = 25;
const PROGRESS_TTS_END = 90;
const PROGRESS_UPLOADED = 95;
export async function runPodcastJob(args) {
    const { podcastId, userId, noteId } = args;
    const targetMinutes = args.targetMinutes ?? 10;
    const useApnsSandbox = args.useApnsSandbox === true;
    try {
        // 1. Load the note.
        const { data: note, error: noteErr } = await supabase
            .from("notes")
            .select("id, title, ai_summary, raw_transcript, display_language_code")
            .eq("id", noteId)
            .single();
        if (noteErr || !note)
            throw new Error(`note_load_failed: ${noteErr?.message}`);
        const sourceText = note.ai_summary?.trim() || note.raw_transcript?.trim() || "";
        if (!sourceText)
            throw new Error("note_has_no_content");
        await writeProgress(podcastId, PROGRESS_LOADED);
        // Caller's pick wins; otherwise fall back to whatever language the
        // note's summary is currently displayed in. Either may be null —
        // generateScript handles that by telling the LLM to match the source.
        const effectiveLanguage = args.languageCode ?? note.display_language_code ?? null;
        // 2. Generate script with Gemini.
        const script = await generateScript({
            title: note.title,
            content: sourceText,
            focus: args.focus ?? null,
            targetMinutes,
            languageCode: effectiveLanguage,
        });
        if (script.length === 0)
            throw new Error("empty_script");
        // Persist script + flip to a partial state so the iOS UI can show
        // "Generating audio…" while TTS runs.
        await supabase
            .from("podcasts")
            .update({ script, progress_percent: PROGRESS_SCRIPT_DONE })
            .eq("id", podcastId);
        // 3. Synthesize audio per line, concatenate. Reports progress per
        //    line: TTS is the longest phase, so this is what the user
        //    actually watches advance.
        const audio = await synthesizeScript(script, effectiveLanguage, (lineIndex, totalLines) => {
            const span = PROGRESS_TTS_END - PROGRESS_SCRIPT_DONE;
            const pct = PROGRESS_SCRIPT_DONE
                + Math.round(((lineIndex + 1) / totalLines) * span);
            // Fire-and-forget — a missed write is harmless, the next
            // line's update will overwrite it.
            writeProgress(podcastId, pct).catch(() => { });
        });
        // 4. Upload to Storage. Path = "<userId>/<noteId>/<podcastId>.mp3".
        const path = `${userId}/${noteId}/${podcastId}.mp3`;
        const { error: uploadErr } = await supabase.storage
            .from("podcasts")
            .upload(path, audio, {
            contentType: "audio/mpeg",
            upsert: true,
        });
        if (uploadErr)
            throw new Error(`upload_failed: ${uploadErr.message}`);
        await writeProgress(podcastId, PROGRESS_UPLOADED);
        // 5. Mark ready. iOS reads audio_path and asks Storage for a signed
        //    URL when it wants to play.
        const durationSecs = estimateDurationSecs(script);
        const { data: finalized, error: doneErr } = await supabase
            .from("podcasts")
            .update({
            status: "ready",
            audio_path: path,
            duration_secs: durationSecs,
            progress_percent: 100,
        })
            .eq("id", podcastId)
            .select("notify_when_ready, user_id, title")
            .single();
        if (doneErr)
            throw new Error(`finalize_failed: ${doneErr.message}`);
        console.log(`podcast ${podcastId} ready (${durationSecs}s)`);
        if (finalized) {
            const row = finalized;
            await sendPodcastReadyPushIfNeeded(supabase, {
                userId: row.user_id,
                podcastId,
                title: row.title,
                notifyWhenReady: Boolean(row.notify_when_ready),
                useApnsSandbox,
            }).catch((e) => console.warn("apns: sendPodcastReadyPushIfNeeded:", e));
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`podcast ${podcastId} failed:`, message);
        await supabase
            .from("podcasts")
            .update({
            status: "failed",
            generation_error: message.slice(0, 2000),
        })
            .eq("id", podcastId);
    }
}
// Monotonic: never moves the bar backwards. The clamp keeps a stale write
// (e.g. a slow earlier-line update arriving after a later one) from
// regressing the value the user sees.
async function writeProgress(podcastId, pct) {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    const { data, error } = await supabase
        .from("podcasts")
        .select("progress_percent")
        .eq("id", podcastId)
        .single();
    if (error || !data)
        return;
    if (clamped <= (data.progress_percent ?? 0))
        return;
    await supabase
        .from("podcasts")
        .update({ progress_percent: clamped })
        .eq("id", podcastId);
}
// ---------------------------------------------------------------------------
// Script generation (Gemini)
// ---------------------------------------------------------------------------
async function generateScript(input) {
    const language = input.languageCode
        ? `Write the dialogue in ${input.languageCode} (ISO 639-1).`
        : "Match the language of the source content.";
    const focusBlock = input.focus
        ? `\n\nFocus the conversation on these points the user picked out:\n${input.focus}`
        : "";
    const systemPrompt = `You are a podcast script writer. Produce a natural two-host conversation between HOST_A (curious, asks questions) and HOST_B (subject expert, explains). Aim for ~${input.targetMinutes} minutes when read aloud at ~150 words/minute, so target roughly ${input.targetMinutes * 150} words total. Keep turns short (1–3 sentences) and conversational. ${language}

Return STRICT JSON in this exact shape, no prose, no markdown fences:
{"lines":[{"speaker":"host_a","text":"..."},{"speaker":"host_b","text":"..."}]}`;
    const userPrompt = `Title: ${input.title}\n\nContent:\n${truncate(input.content, 60_000)}${focusBlock}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
                temperature: 0.8,
                responseMimeType: "application/json",
            },
        }),
    });
    if (!resp.ok) {
        throw new Error(`gemini_failed: ${resp.status} ${await resp.text()}`);
    }
    const json = (await resp.json());
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(text);
    const lines = (parsed.lines ?? []).filter((l) => (l.speaker === "host_a" || l.speaker === "host_b") && l.text?.trim());
    return lines;
}
// ---------------------------------------------------------------------------
// TTS (xAI Grok)
// ---------------------------------------------------------------------------
const XAI_TTS_URL = "https://api.x.ai/v1/tts";
const XAI_MAX_CHARS = 15_000;
async function synthesizeScript(script, languageCode, onLineDone) {
    const language = languageCode ?? "auto";
    const chunks = [];
    for (let i = 0; i < script.length; i++) {
        const line = script[i];
        const voiceId = line.speaker === "host_a" ? voices.hostA : voices.hostB;
        const audio = await ttsLine(line.text, voiceId, language);
        chunks.push(audio);
        onLineDone?.(i, script.length);
    }
    // Naive concat works for MP3 frames that share codec params, which xAI
    // outputs do at a fixed sample_rate/bit_rate. Good enough for v1; swap
    // to ffmpeg concat if seams pop on long podcasts.
    return Buffer.concat(chunks);
}
async function ttsLine(text, voiceId, language) {
    // Hard cap: xAI rejects requests > 15k chars. Script lines are ~1-3
    // sentences so this is just a safety net.
    const trimmed = text.length > XAI_MAX_CHARS ? text.slice(0, XAI_MAX_CHARS) : text;
    const resp = await fetch(XAI_TTS_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${xaiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            text: trimmed,
            voice_id: voiceId,
            language,
            output_format: {
                codec: "mp3",
                sample_rate: 44100,
                bit_rate: 128000,
            },
        }),
    });
    if (!resp.ok) {
        throw new Error(`xai_tts_failed: ${resp.status} ${await resp.text()}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length === 0)
        throw new Error("xai_tts_empty_audio");
    return buf;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function estimateDurationSecs(script) {
    const words = script.reduce((acc, l) => acc + l.text.split(/\s+/).filter(Boolean).length, 0);
    // ~150 words per minute average speaking rate.
    return Math.round((words / 150) * 60);
}
function truncate(s, max) {
    return s.length <= max ? s : s.slice(0, max);
}
//# sourceMappingURL=podcast.js.map