// ---------------------------------------------------------------------------
// Cloudflare Worker: CORS relay for the MaibornWolff AI proxy (aikeys).
//
// Why: browsers block cross-origin requests to aikeys.maibornwolff.de from the
// GitHub Pages site ("Failed to fetch" / CORS). This Worker forwards the
// request server-side (where CORS doesn't apply) and adds the CORS headers the
// browser needs. Your API key travels in the Authorization header and is passed
// straight through — this Worker stores nothing.
//
// Deploy (all in the browser, ~3 min, free):
//   1. https://dash.cloudflare.com → Workers & Pages → Create → Create Worker.
//   2. Name it e.g. "ai-proxy", click Deploy, then "Edit code".
//   3. Select all, paste THIS file, click Deploy.
//   4. Copy the Worker URL, e.g. https://ai-proxy.<your-subdomain>.workers.dev
//   5. In the app: AI Assistant → ⚙️ AI settings → Endpoint (advanced) →
//      paste the Worker URL → Save. (It syncs to your other devices too.)
// ---------------------------------------------------------------------------

const UPSTREAM = "https://aikeys.maibornwolff.de";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // Forward only the headers the upstream needs.
    const fwd = new Headers();
    const auth = request.headers.get("Authorization");
    if (auth) fwd.set("Authorization", auth);
    const ct = request.headers.get("Content-Type");
    if (ct) fwd.set("Content-Type", ct);

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const body = hasBody ? await request.arrayBuffer() : undefined;

    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      method: request.method,
      headers: fwd,
      body,
    });

    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
