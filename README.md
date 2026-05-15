# nexnote-server

Backend and marketing site for NexNote.

- `marketing-site/` — Cloudflare Pages site:
  - `dist/` — static assets (`index.html`, `privacy.html`, `terms.html`, `styles.css`).
- `functions/` — Cloudflare Pages Functions for dynamic routes (`/s/<token>` shared-note view, `/report` form). **Lives at the repo root**, not inside `marketing-site/`, because wrangler's direct-upload mode discovers `./functions/` relative to where the command is run.
- `supabase/` — Supabase project (`cuvbqytpwentiekfkglq`): edge functions and migrations.

## Deploying the marketing site to Cloudflare Pages

The site is hosted on Cloudflare Pages as project **`nexnote`** under the account associated with `xavi.pedrals@gmail.com`. The deployable assets live in `marketing-site/dist/`; the dynamic routes live in `functions/` at the repo root and are bundled into the same upload by wrangler. **Run wrangler from the repo root** so it finds both.

### One-time setup

```sh
npx wrangler login
```

This opens a browser, you authorize, and wrangler caches the account in `.wrangler/cache/wrangler-account.json`.

### Deploy

From the repo root:

```sh
npx wrangler@latest pages deploy marketing-site/dist \
  --project-name=nexnote \
  --branch=production
```

On the first run, wrangler will prompt to create the project if it doesn't exist and to pick a production branch — pick `master`. The selection is cached in `.wrangler/cache/pages.json` so subsequent runs are non-interactive.

Wrangler prints a preview URL after each deploy, plus the production URL once the deploy is promoted. The dynamic routes (`/s/<token>`, `/report`) ship as Pages Functions in the same upload — no separate command.

### Required environment variables

Pages Functions need to know where the Supabase project is and which publishable key to send. Both values are non-secret — they're already shipped inside the iOS app — but keeping them as env vars makes rotation cheap. The service-role key is **never** stored in Cloudflare; the Pages Functions call narrow public Supabase edge functions (`get-shared-note`, `submit-report`) which hold the service role internally.

Set these in the Cloudflare Pages dashboard (project **nexnote** → **Settings → Environment variables**) for both **Production** and **Preview** environments, or via wrangler:

```sh
npx wrangler pages secret put SUPABASE_URL --project-name=nexnote
npx wrangler pages secret put SUPABASE_ANON_KEY --project-name=nexnote
```

| Var | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | `/s/<token>`, `/report` | e.g. `https://cuvbqytpwentiekfkglq.supabase.co` |
| `SUPABASE_ANON_KEY` | `/s/<token>` | The project's publishable (`sb_publishable_...`) key — the same key shipped in the iOS app. Required by Supabase's gateway as the `apikey` header even for `verify_jwt = false` functions. Not a secret; safe to rotate. |

### Updating content

Edit the source HTML/CSS in `marketing-site/`, copy the changed files into `marketing-site/dist/`, then re-run the deploy command above. (`dist/` is the directory wrangler uploads — anything not in there does not ship.) When changing Universal Links, also copy `marketing-site/.well-known/` → `marketing-site/dist/.well-known/` and `marketing-site/dist/_headers` if updated. Pages Functions are picked up live from `functions/` at the repo root; no copy step.

## Deploying Supabase pieces

The marketing-site share + report flow depends on:

1. **Migration** `supabase/migrations/20260430120000_note_reports.sql` — adds the `note_reports` table and the `note_report_reason` enum. Apply with:
   ```sh
   npx supabase db push
   ```
2. **Edge functions** — both are `verify_jwt = false` (public, no auth required), and both use the auto-injected `SUPABASE_SERVICE_ROLE_KEY` internally so the service-role key never has to live anywhere else:
   ```sh
   npx supabase functions deploy get-shared-note   # token → note JSON, called by /s/<token>
   npx supabase functions deploy submit-report     # report POST handler, called by /report form
   ```
3. **Optional secrets for email notifications** on incoming reports (without these, reports still land in `note_reports` — only the email alert is skipped):
   ```sh
   npx supabase secrets set RESEND_API_KEY=re_...           # https://resend.com
   npx supabase secrets set REPORT_NOTIFY_EMAIL=bestindieapps@gmail.com   # default
   npx supabase secrets set REPORT_FROM_EMAIL=reports@nexnote.app          # must be a verified Resend domain
   ```
