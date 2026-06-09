// Cloudflare Pages Function — /s/<token>
// ---------------------------------------------------------------------------
// Server-side renders a publicly shared note when given a valid share-link
// token. Token validation + note lookup are delegated to the Supabase
// `get-shared-note` edge function — this Pages Function never holds the
// service-role key, only a publishable key (already shipped in the iOS app
// and therefore not a secret).
//
// Required env vars (set in Cloudflare Pages → Settings → Environment):
//   - SUPABASE_URL              e.g. https://<project>.supabase.co
//   - SUPABASE_ANON_KEY         the project's `sb_publishable_...` key —
//                                same value the iOS app holds. Not a secret;
//                                it's the apikey header the Supabase gateway
//                                requires even for `verify_jwt = false`
//                                functions.
// ---------------------------------------------------------------------------

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

interface SharedNote {
  noteId: string;
  title: string;
  icon: string;
  markdown: string;
  displayLanguageCode: string | null;
}

const NO_STORE: HeadersInit = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const tokenRaw = params.token;
  const token =
    typeof tokenRaw === "string"
      ? tokenRaw
      : Array.isArray(tokenRaw)
      ? tokenRaw[0]
      : "";

  if (!token) {
    return new Response(renderShareNotFound(), { status: 404, headers: NO_STORE });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.error("[/s/<token>] missing SUPABASE_URL or SUPABASE_ANON_KEY env var");
    return new Response(renderShareNotFound(), { status: 500, headers: NO_STORE });
  }

  try {
    const result = await fetchSharedNote(env, token);
    if (!result) {
      return new Response(renderShareNotFound(), { status: 404, headers: NO_STORE });
    }
    return new Response(renderSharedNote(result, token), { headers: NO_STORE });
  } catch (err) {
    console.error("[/s/<token>] error:", (err as Error).message);
    return new Response(renderShareNotFound(), { status: 500, headers: NO_STORE });
  }
};

async function fetchSharedNote(env: Env, token: string): Promise<SharedNote | null> {
  const url = new URL(
    `${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/get-shared-note`,
  );
  url.searchParams.set("token", token);

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      // Supabase's gateway requires `apikey` even for verify_jwt=false
      // functions; it's how the gateway routes to the right project.
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      Accept: "application/json",
    },
  });

  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`get-shared-note ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }

  const data = (await resp.json()) as Partial<SharedNote>;
  if (!data || typeof data.noteId !== "string") return null;
  return {
    noteId: data.noteId,
    title: typeof data.title === "string" ? data.title : "Untitled note",
    icon: typeof data.icon === "string" ? data.icon : "📄",
    markdown: typeof data.markdown === "string" ? data.markdown : "",
    displayLanguageCode:
      typeof data.displayLanguageCode === "string" ? data.displayLanguageCode : null,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSharedNote(note: SharedNote, token: string): string {
  const md = note.markdown.trim();
  const body = md
    ? renderMarkdown(md)
    : "<p><em>This note doesn't have a summary yet.</em></p>";
  const safeTitle = escapeHtml(note.title);
  const safeIcon = escapeHtml(note.icon);
  const previewText = md
    .replace(/[#*_`>\-\[\]\(\)!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const safePreview = escapeHtml(previewText || "Shared with NuNotes");
  const reportHref =
    `/report?token=${encodeURIComponent(token)}` +
    `&noteId=${encodeURIComponent(note.noteId)}`;
  const langAttr = note.displayLanguageCode
    ? ` lang="${escapeHtml(note.displayLanguageCode)}"`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — NuNotes</title>
<meta name="description" content="${safePreview}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safePreview}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safePreview}">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a href="/" class="nav-logo">NuNotes</a>
    <div class="nav-links">
      <a href="/#download" class="btn btn-primary">Get the app</a>
    </div>
  </div>
</nav>

<main class="share">
  <div class="container-narrow">
    <div class="share-cta">
      <div class="share-cta-text">
        <strong>Shared from NuNotes.</strong> Open notes like this in the iOS app to study, generate flashcards, and listen to AI podcasts.
      </div>
      <a href="/#download" class="btn btn-primary">Get NuNotes</a>
    </div>

    <header class="share-header">
      <div class="share-icon" aria-hidden="true">${safeIcon}</div>
      <h1 class="share-title">${safeTitle}</h1>
      <p class="share-meta">Shared note</p>
    </header>

    <article class="share-body"${langAttr}>
${body}
    </article>

    <footer class="share-footer">
      <div class="share-footer-note">© NuNotes — Anyone with the link can view.</div>
      <a class="share-report-link" href="${reportHref}">Report this content</a>
    </footer>
  </div>
</main>

</body>
</html>`;
}

function renderShareNotFound(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Link not available — NuNotes</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a href="/" class="nav-logo">NuNotes</a>
    <div class="nav-links">
      <a href="/#download" class="btn btn-primary">Get the app</a>
    </div>
  </div>
</nav>

<main class="share">
  <div class="container-narrow share-error">
    <h1>This link isn't available.</h1>
    <p>The share link may have been revoked, expired, or never existed.</p>
    <a href="/" class="btn btn-primary btn-lg">Back to NuNotes</a>
  </div>
</main>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Tiny markdown renderer
// ---------------------------------------------------------------------------
//
// Hand-rolled rather than pulling in `marked` to keep this Function dependency-
// free (no package.json / npm step in the deploy pipeline). Handles the
// constructs our LLM-generated `ai_summary` actually emits: ATX headings,
// fenced code blocks, ordered/unordered lists, blockquotes, paragraphs, plus
// inline bold / italic / code / links. No tables — AI summaries rarely use
// them; revisit if that changes.
//
// Source is owner-authored markdown that's been through Gemini, so it's
// effectively trusted, but we still escape HTML in raw text and only ever
// produce safe output (no <script>, no event-handler attrs).
// ---------------------------------------------------------------------------

function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const codeContent = escapeHtml(buf.join("\n"));
      const langCls = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
      out.push(`<pre><code${langCls}>${codeContent}</code></pre>`);
      continue;
    }

    // Blank line
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // ATX heading (# .. ######)
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote (one or more consecutive `> ` lines)
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderInline(buf.join(" "))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out.push(
        `<ul>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</ul>`,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        `<ol>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</ol>`,
      );
      continue;
    }

    // Paragraph: gather contiguous non-blank, non-block-starter lines
    const paragraph: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return out.join("\n");
}

function renderInline(text: string): string {
  // Escape first, then re-introduce specific markdown tokens.
  let s = escapeHtml(text);
  // Inline code (do this before bold/italic so backticks lock the run).
  s = s.replace(/`([^`]+?)`/g, (_, c) => `<code>${c}</code>`);
  // Bold + italic (***, **, *, __, _).
  s = s.replace(/\*\*\*([^*]+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, "$1<em>$2</em>");
  // Links: [text](url) — only http(s)/mailto, mitigates javascript: vectors.
  s = s.replace(
    /\[([^\]]+?)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_m, t, u) => `<a href="${u}" rel="noopener noreferrer" target="_blank">${t}</a>`,
  );
  // Soft line breaks → <br>.
  s = s.replace(/\n/g, "<br>");
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
