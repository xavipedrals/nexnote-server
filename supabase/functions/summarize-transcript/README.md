# summarize-transcript

Edge function that turns a `.txt` transcript in Supabase Storage into rich markdown study notes using **Gemini 2.5 Flash**. The work runs in a background task (`EdgeRuntime.waitUntil`) and state is tracked in the `summary_jobs` table — the iOS client subscribes via Realtime.

## Setup

1. **Apply the migration** that creates `summary_jobs`:

   ```bash
   supabase db push
   ```

2. **Set the Gemini API key** as a function secret. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

   ```bash
   supabase secrets set GEMINI_API_KEY=your_key_here
   ```

   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Supabase runtime.

3. **Deploy**:

   ```bash
   supabase functions deploy summarize-transcript
   ```

## Usage from the iOS client

### Kick off a new job

```http
POST /functions/v1/summarize-transcript
Authorization: Bearer <user-jwt>
Content-Type: application/json

{ "bucket": "transcripts", "path": "userId/lecture-123.txt" }
```

Response is immediate (`202 Accepted`):

```json
{ "jobId": "…", "status": "queued" }
```

### Subscribe to the job

Subscribe to `summary_jobs` where `id = jobId` via Supabase Realtime. The row transitions:

`queued` → `processing` → `complete` (with `markdown` populated) **or** `failed` (with `error` populated).

### Retry a failed job

Re-invoke with the same `jobId`. The function resets `status`, clears the error, and bumps `retry_count`.

```json
{ "bucket": "transcripts", "path": "userId/lecture-123.txt", "jobId": "<existing>" }
```

## Cost

Gemini 2.5 Flash is ~$0.30 / 1M input tokens and ~$2.50 / 1M output tokens. A typical 1-hour lecture (~15k tokens in, ~3k out) costs roughly **$0.01**. Exact cost per job is persisted in `summary_jobs.cost_usd`.

## Limits

- Transcripts over ~800k characters are truncated (well under Gemini's 1M-token context).
- Edge function wall-clock limit still applies to the background task. For transcripts beyond ~4 hours of dense content, consider chunking.
