# summarize-transcript

Thin enqueue function. Validates the caller, creates / resets a `summary_jobs`
row, and kicks the Cloud Run worker (`POST $WORKER_URL/summarize`) which does
the real Gemini call. Returns `202 Accepted` immediately. iOS subscribes to
the owning `notes` row via Realtime to flip the UI from "Generating…" to the
real summary.

The actual generation logic lives in [cloud-run/worker/src/summarize.ts](../../../cloud-run/worker/src/summarize.ts).
This file used to do the Gemini call inline via `EdgeRuntime.waitUntil`, but
big transcripts hit the edge wall-clock limit and got silently evicted, leaving
notes stuck in `processing` forever. Cloud Run with `--cpu-always-allocated`
keeps CPU after the 202 reply.

## Setup

1. **Apply the migrations**:

   ```bash
   supabase db push
   ```

2. **Set function secrets**. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   are injected automatically; the rest you set manually:

   ```bash
   supabase secrets set WORKER_URL=https://nexnote-worker-xxx.run.app
   supabase secrets set WORKER_SHARED_SECRET=...   # must match the worker
   ```

3. **Deploy**:

   ```bash
   supabase functions deploy summarize-transcript
   ```

   The worker itself lives in `cloud-run/worker/` — see that directory's
   Dockerfile / `.env.example` for deploying the Cloud Run service.

## Usage from the iOS client

### Kick off a new job

```http
POST /functions/v1/summarize-transcript
Authorization: Bearer <user-jwt>
Content-Type: application/json

{ "bucket": "transcripts", "path": "userId/lecture-123.txt", "noteId": "<uuid>" }
```

Response is immediate (`202 Accepted`):

```json
{ "jobId": "…", "status": "queued" }
```

### Subscribe to the result

iOS subscribes to the `notes` row via Realtime. The worker flips
`notes.summary_status` from `processing` → `ready` (with `title`, `icon`,
`ai_summary` populated) or `failed` (with `summary_error` set).

The `summary_jobs` row holds per-attempt observability (token counts, cost,
retry history) but the iOS UI reads `notes` directly.

### Retry a failed job

Re-invoke with the same `jobId`. The function resets `status`, clears the
error, and bumps `retry_count`.

```json
{ "bucket": "transcripts", "path": "userId/lecture-123.txt", "noteId": "<uuid>", "jobId": "<existing>" }
```

## Cost

Gemini 2.5 Flash is ~$0.30 / 1M input tokens and ~$2.50 / 1M output tokens. A
typical 1-hour lecture (~15k tokens in, ~3k out) is roughly **$0.01**. Per-job
cost is persisted in `summary_jobs.cost_usd`.

## Limits

- Transcripts over 800 000 characters are truncated.
- The Cloud Run request timeout (configurable up to 60 min) is the new
  upper bound on a single job.
