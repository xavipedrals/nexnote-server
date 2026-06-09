// Cloudflare Pages Function — /report
// ---------------------------------------------------------------------------
// Renders the public content-report form. The form posts JSON directly to
// the Supabase `submit-report` edge function, which handles persistence
// (`note_reports` table) and the email notification.
//
// We render this as a Function (rather than static HTML) so we can inject
// the Supabase functions URL at request time — the static bundle has no
// build-time templating, and we don't want to hard-code `<project-ref>`
// into a checked-in HTML file.
//
// Required env vars (Cloudflare Pages → Settings → Environment):
//   - SUPABASE_URL       e.g. https://<project>.supabase.co
//   - SUPABASE_ANON_KEY  publishable key — sent as `apikey` on the POST to
//                        `submit-report` (same as `/s/<token>` uses for reads)
//
// Query params:
//   ?token=<share-token>  — when present, pre-associates the report with
//                           the share link the reporter clicked through.
//   ?noteId=<uuid>        — fallback target note when no token (e.g. opened
//                           from the iOS app) or when the token lookup fails.
// ---------------------------------------------------------------------------

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const NO_STORE: HeadersInit = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const noteId = url.searchParams.get("noteId");
  const submitUrl = env.SUPABASE_URL
    ? `${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/submit-report`
    : "";
  return new Response(
    renderReportPage(token, noteId, submitUrl, env.SUPABASE_ANON_KEY ?? ""),
    { headers: NO_STORE },
  );
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderReportPage(
  token: string | null,
  noteId: string | null,
  submitUrl: string,
  apiKey: string,
): string {
  const safeToken = token ? escapeHtml(token) : "";
  const safeNoteId = noteId ? escapeHtml(noteId) : "";
  const safeSubmitUrl = escapeHtml(submitUrl);
  const safeApiKey = escapeHtml(apiKey);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Report content — NuNotes</title>
<meta name="description" content="Report content shared on NuNotes that you believe violates copyright, our terms, or applicable law.">
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

<main class="report">
  <div class="container-narrow">
    <h1>Report content</h1>
    <p class="lede">Tell us what's wrong with this content. Reports are reviewed by our team. For copyright complaints we accept DMCA notices following 17 U.S.C. §512(c)(3).</p>

    <div id="report-success" class="report-success hidden">
      Thanks — your report has been submitted. We'll review it and follow up if we need more information.
    </div>

    <form id="report-form" class="report-form" data-endpoint="${safeSubmitUrl}" data-apikey="${safeApiKey}" data-token="${safeToken}" data-note-id="${safeNoteId}" novalidate>
      <div>
        <label class="report-field-label">Why are you reporting this content?</label>
        <div class="report-radio-group">
          <label class="report-radio"><input type="radio" name="reason" value="copyright" required><span>Copyright infringement</span></label>
          <label class="report-radio"><input type="radio" name="reason" value="inappropriate"><span>Inappropriate content</span></label>
          <label class="report-radio"><input type="radio" name="reason" value="harmful"><span>Harmful or dangerous</span></label>
          <label class="report-radio"><input type="radio" name="reason" value="privacy"><span>Privacy violation</span></label>
          <label class="report-radio"><input type="radio" name="reason" value="spam"><span>Spam or scam</span></label>
          <label class="report-radio"><input type="radio" name="reason" value="other"><span>Other</span></label>
        </div>
      </div>

      <div>
        <label class="report-field-label" for="report-description">Tell us more (optional but recommended)</label>
        <textarea class="report-textarea" id="report-description" name="description" placeholder="What part of the content is the problem? Include URLs, copyright proof, or other context that helps us investigate."></textarea>
      </div>

      <div>
        <label class="report-field-label" for="report-name">Your name (optional)</label>
        <input class="report-input" type="text" id="report-name" name="reporterName" autocomplete="name">
      </div>

      <div>
        <label class="report-field-label" for="report-email">Email for follow-up (optional)</label>
        <input class="report-input" type="email" id="report-email" name="reporterEmail" autocomplete="email">
        <div class="report-field-help">We may contact you for clarification. We won't share this address.</div>
      </div>

      <div id="report-error" class="report-error-msg hidden"></div>

      <button id="report-submit" class="btn btn-primary report-submit" type="submit">Submit report</button>
    </form>
  </div>
</main>

<script>
(function () {
  var form = document.getElementById('report-form');
  if (!form) return;
  var submit = document.getElementById('report-submit');
  var errBox = document.getElementById('report-error');
  var success = document.getElementById('report-success');
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    errBox.classList.add('hidden');
    if (!form.dataset.endpoint) {
      errBox.textContent = 'Reporting is temporarily unavailable. Please try again later.';
      errBox.classList.remove('hidden');
      return;
    }
    var fd = new FormData(form);
    var reason = fd.get('reason');
    if (!reason) {
      errBox.textContent = 'Please choose a reason.';
      errBox.classList.remove('hidden');
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Submitting…';
    // Prefer data-* attrs; fall back to URL params (e.g. opened from iOS with ?noteId=).
    var params = new URLSearchParams(window.location.search);
    var payload = {
      token: form.dataset.token || params.get('token') || undefined,
      noteId: form.dataset.noteId || params.get('noteId') || undefined,
      reason: reason,
      description: fd.get('description') || undefined,
      reporterName: fd.get('reporterName') || undefined,
      reporterEmail: fd.get('reporterEmail') || undefined,
    };
    var headers = { 'Content-Type': 'application/json' };
    if (form.dataset.apikey) {
      headers.apikey = form.dataset.apikey;
      headers.Authorization = 'Bearer ' + form.dataset.apikey;
    }
    fetch(form.dataset.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    })
      .then(function (resp) { return resp.json().then(function (j) { return { ok: resp.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          throw new Error((res.body && res.body.error) || 'Submission failed.');
        }
        form.classList.add('hidden');
        success.classList.remove('hidden');
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .catch(function (err) {
        errBox.textContent = err && err.message ? err.message : 'Submission failed.';
        errBox.classList.remove('hidden');
        submit.disabled = false;
        submit.textContent = 'Submit report';
      });
  });
})();
</script>

</body>
</html>`;
}
