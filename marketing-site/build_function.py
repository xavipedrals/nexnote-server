#!/usr/bin/env python3
"""Bundle marketing site assets into a single Deno edge function."""
import pathlib
import json

SITE = pathlib.Path(__file__).parent

def escape_template(s: str) -> str:
    # Escape for JS template literal: backslash, backtick, ${
    return s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

def load(name: str) -> str:
    return (SITE / name).read_text(encoding="utf-8")

index_html = escape_template(load("index.html"))
privacy_html = escape_template(load("privacy.html"))
terms_html = escape_template(load("terms.html"))
styles_css = escape_template(load("styles.css"))

ts = f"""import \"jsr:@supabase/functions-js/edge-runtime.d.ts\";

const INDEX_HTML = `{index_html}`;
const PRIVACY_HTML = `{privacy_html}`;
const TERMS_HTML = `{terms_html}`;
const STYLES_CSS = `{styles_css}`;

const HTML_HEADERS = {{
  \"Content-Type\": \"text/html; charset=utf-8\",
  \"Cache-Control\": \"public, max-age=300\",
  \"X-Content-Type-Options\": \"nosniff\",
}};

const CSS_HEADERS = {{
  \"Content-Type\": \"text/css; charset=utf-8\",
  \"Cache-Control\": \"public, max-age=3600\",
  \"X-Content-Type-Options\": \"nosniff\",
}};

function normalizePath(pathname: string): string {{
  const match = pathname.match(/\\/site(\\/.*)?$/);
  let sub = match ? (match[1] ?? \"\") : pathname;
  if (sub.length > 1 && sub.endsWith(\"/\")) sub = sub.slice(0, -1);
  return sub;
}}

Deno.serve((req: Request) => {{
  const url = new URL(req.url);
  const sub = normalizePath(url.pathname);

  switch (sub) {{
    case \"\":
    case \"/\":
    case \"/index\":
    case \"/index.html\":
      return new Response(INDEX_HTML, {{ headers: HTML_HEADERS }});
    case \"/privacy\":
    case \"/privacy.html\":
      return new Response(PRIVACY_HTML, {{ headers: HTML_HEADERS }});
    case \"/terms\":
    case \"/terms.html\":
      return new Response(TERMS_HTML, {{ headers: HTML_HEADERS }});
    case \"/styles.css\":
      return new Response(STYLES_CSS, {{ headers: CSS_HEADERS }});
    default:
      return new Response(\"Not found\", {{ status: 404 }});
  }}
}});
"""

out = SITE / "index.ts"
out.write_text(ts, encoding="utf-8")

# Also emit JSON payload that can be read and used when invoking the MCP deploy tool
payload = {
    "name": "site",
    "entrypoint_path": "index.ts",
    "verify_jwt": False,
    "files": [
        {"name": "index.ts", "content": ts},
    ],
}
(SITE / "deploy_payload.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

print(f"Wrote {out} ({len(ts)} bytes)")
print(f"Wrote {SITE / 'deploy_payload.json'}")
