import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { supabase, openai } from "./clients.js";
import { runSummaryJob } from "./summarize.js";
const TRANSCRIPT_BUCKET = "note-sources";
/// Chained after a successful transcription. Uploads the transcript text as
/// a `.txt` blob in the same bucket as `summarize-transcript` expects, then
/// inserts a `summary_jobs` row and runs the summary in-process — same
/// container, no extra HTTP round-trip. Failures here are logged but don't
/// fail the transcription itself: the user still has a transcribed note in
/// `processing` they can retry from the UI.
async function kickSummary(args) {
    const { userId, noteId, transcript } = args;
    const transcriptPath = `users/${userId}/transcripts/${randomUUID()}.txt`;
    const { error: uploadErr } = await supabase.storage
        .from(TRANSCRIPT_BUCKET)
        .upload(transcriptPath, Buffer.from(transcript, "utf-8"), {
        contentType: "text/plain; charset=utf-8",
        upsert: false,
    });
    if (uploadErr)
        throw new Error(`transcript_upload_failed: ${uploadErr.message}`);
    const jobId = randomUUID();
    const { error: jobErr } = await supabase.from("summary_jobs").insert({
        id: jobId,
        user_id: userId,
        note_id: noteId,
        bucket: TRANSCRIPT_BUCKET,
        path: transcriptPath,
        status: "queued",
    });
    if (jobErr)
        throw new Error(`summary_job_insert_failed: ${jobErr.message}`);
    await runSummaryJob({
        jobId,
        noteId,
        bucket: TRANSCRIPT_BUCKET,
        path: transcriptPath,
    });
}
// Whisper API hard limit is 25 MB. We compress to mono 16 kHz @ 48 kbps,
// which fits ~70 minutes per file. For longer audio we'd add chunking; iOS
// caps lecture length so this is enough for v1.
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
export async function runTranscriptionJob(args) {
    const { sourceId, noteId, storagePath } = args;
    const workDir = await mkdtemp(path.join(tmpdir(), `whisper-${sourceId}-`));
    try {
        // 1. Download original audio from Storage.
        const { data: file, error: dlErr } = await supabase.storage
            .from("note-sources")
            .download(storagePath);
        if (dlErr || !file) {
            throw new Error(`download_failed: ${dlErr?.message}`);
        }
        const originalPath = path.join(workDir, "input");
        await writeFile(originalPath, Buffer.from(await file.arrayBuffer()));
        // 2. Compress with ffmpeg → mono 16 kHz MP3 @ 48 kbps.
        const compressedPath = path.join(workDir, "compressed.mp3");
        await runFfmpeg([
            "-y",
            "-i", originalPath,
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-b:a", "48k",
            compressedPath,
        ]);
        const { size } = await stat(compressedPath);
        if (size > WHISPER_MAX_BYTES) {
            throw new Error(`audio_too_large: ${size} bytes after compression (limit ${WHISPER_MAX_BYTES})`);
        }
        // 3. Whisper transcription.
        const transcription = await openai.audio.transcriptions.create({
            file: createReadStream(compressedPath),
            model: "whisper-1",
            response_format: "verbose_json",
        });
        const text = transcription.text?.trim() ?? "";
        const duration = transcription.duration;
        if (!text)
            throw new Error("empty_transcript");
        // 4. Write transcript back onto the source row.
        const { error: updErr } = await supabase
            .from("note_sources")
            .update({
            status: "ready",
            extracted_text: text,
            duration_secs: duration ? Math.round(duration) : null,
            extraction_error: null,
        })
            .eq("id", sourceId);
        if (updErr)
            throw new Error(`source_update_failed: ${updErr.message}`);
        // 5. Append into the note's merged transcript so summarize-transcript
        //    and downstream features pick it up. Append (don't overwrite) —
        //    a note can have several sources.
        await appendToNoteTranscript(noteId, text);
        console.log(`transcription ${sourceId} ready (${text.length} chars)`);
        // 6. Hand the transcript off to summarization in-process. The note row
        //    was created by iOS in `processing` state; this lands the title /
        //    icon / markdown via Realtime so the list flips from
        //    "Generating…" without iOS having to do a second round-trip.
        try {
            await kickSummary({ userId: args.userId, noteId, transcript: text });
        }
        catch (summaryErr) {
            const message = summaryErr instanceof Error
                ? summaryErr.message
                : String(summaryErr);
            console.error(`transcription ${sourceId} summary kick failed:`, message);
            // Don't clobber the transcript — only flag the note so the user
            // sees a retry affordance instead of a silent stuck-spinner.
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
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`transcription ${sourceId} failed:`, message);
        await supabase
            .from("note_sources")
            .update({
            status: "failed",
            extraction_error: message.slice(0, 2000),
        })
            .eq("id", sourceId);
    }
    finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => { });
    }
}
async function appendToNoteTranscript(noteId, addition) {
    const { data: note, error } = await supabase
        .from("notes")
        .select("raw_transcript")
        .eq("id", noteId)
        .single();
    if (error) {
        console.warn(`could not append transcript for note ${noteId}: ${error.message}`);
        return;
    }
    const existing = note?.raw_transcript ?? "";
    const merged = existing ? `${existing}\n\n${addition}` : addition;
    const { error: updErr } = await supabase
        .from("notes")
        .update({ raw_transcript: merged })
        .eq("id", noteId);
    if (updErr) {
        console.warn(`note transcript update failed: ${updErr.message}`);
    }
}
function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        proc.stderr.on("data", (chunk) => {
            stderr += String(chunk);
        });
        proc.on("error", reject);
        proc.on("close", (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
        });
    });
}
//# sourceMappingURL=transcription.js.map