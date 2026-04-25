# nexnote-server

Backend and marketing site for NexNote.

- `marketing-site/` — static landing page (`index.html`, `privacy.html`, `terms.html`, `styles.css`) deployed to Cloudflare Pages.
- `supabase/` — Supabase project (`cuvbqytpwentiekfkglq`): edge functions and migrations.

## Deploying the marketing site to Cloudflare Pages

The site is hosted on Cloudflare Pages as project **`nexnote`** under the account associated with `xavi.pedrals@gmail.com`. The deployable assets live in `marketing-site/dist/`.

### One-time setup

```sh
npx wrangler login
```

This opens a browser, you authorize, and wrangler caches the account in `.wrangler/cache/wrangler-account.json`.

### Deploy

From the repo root:

```sh
npx wrangler@latest pages deploy marketing-site/dist --project-name=nexnote
```

On the first run, wrangler will prompt to create the project if it doesn't exist and to pick a production branch — pick `master`. The selection is cached in `.wrangler/cache/pages.json` so subsequent runs are non-interactive.

Wrangler prints a preview URL after each deploy, plus the production URL once the deploy is promoted.

### Updating content

Edit the source HTML/CSS in `marketing-site/`, copy the changed files into `marketing-site/dist/`, then re-run the deploy command above. (`dist/` is the directory wrangler uploads — anything not in there does not ship.)
