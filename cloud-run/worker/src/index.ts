import express, { type Request, type Response, type NextFunction } from "express";
import { runPodcastJob } from "./podcast.js";
import { runTranscriptionJob } from "./transcription.js";
import { runSummaryJob } from "./summarize.js";

const PORT = Number(process.env.PORT ?? 8080);
const SHARED_SECRET = process.env.WORKER_SHARED_SECRET;
if (!SHARED_SECRET) throw new Error("WORKER_SHARED_SECRET is required");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

function requireSecret(req: Request, res: Response, next: NextFunction) {
    const auth = req.header("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (provided !== SHARED_SECRET) {
        res.status(401).json({ error: "unauthorized" });
        return;
    }
    next();
}

// POST /podcast — enqueued by the `enqueue-podcast` edge function.
// Returns 202 immediately and runs the work in the background. Cloud Run
// must be deployed with `--cpu-always-allocated` (or equivalent) so the
// container keeps CPU after the response is sent.
app.post("/podcast", requireSecret, (req, res) => {
    const { podcastId, userId, noteId, focus, targetMinutes } = req.body ?? {};
    if (!podcastId || !userId || !noteId) {
        res.status(400).json({ error: "invalid_body" });
        return;
    }
    res.status(202).json({ accepted: true });
    runPodcastJob({ podcastId, userId, noteId, focus, targetMinutes }).catch(
        (err) => console.error(`podcast ${podcastId} crashed:`, err),
    );
});

// POST /transcribe — enqueued by the `enqueue-transcription` edge function.
app.post("/transcribe", requireSecret, (req, res) => {
    const { sourceId, userId, noteId, storagePath } = req.body ?? {};
    if (!sourceId || !userId || !storagePath) {
        res.status(400).json({ error: "invalid_body" });
        return;
    }
    res.status(202).json({ accepted: true });
    runTranscriptionJob({ sourceId, userId, noteId, storagePath }).catch(
        (err) => console.error(`transcribe ${sourceId} crashed:`, err),
    );
});

// POST /summarize — enqueued by the `summarize-transcript` edge function.
// Pulls the transcript out of Storage, asks Gemini for the structured
// title/icon/markdown payload, and writes the result onto both
// `summary_jobs` and the owning `notes` row so iOS can react via Realtime.
app.post("/summarize", requireSecret, (req, res) => {
    const { jobId, noteId, bucket, path } = req.body ?? {};
    if (!jobId || !noteId || !bucket || !path) {
        res.status(400).json({ error: "invalid_body" });
        return;
    }
    res.status(202).json({ accepted: true });
    runSummaryJob({ jobId, noteId, bucket, path }).catch(
        (err) => console.error(`summary ${jobId} crashed:`, err),
    );
});

app.listen(PORT, () => {
    console.log(`nexnote-worker listening on :${PORT}`);
});
