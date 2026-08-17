// ---------------------------------------------------------------------------
// Supabase Edge Function: CORS relay for the MaibornWolff AI proxy (aikeys).
//
// Same job as the Cloudflare version: the browser can't call aikeys directly
// (CORS / "Failed to fetch"), so this function forwards the request server-side
// and adds the CORS headers the browser needs. Your API key rides in the
// Authorization header and is passed straight through — nothing is stored.
//
// Deploy (all in the Supabase dashboard, no CLI):
//   1. Supabase dashboard → Edge Functions → "Deploy a new function"
//      → "Via Editor" (in-browser).
//   2. Name it exactly:  ai-proxy
//   3. Delete the sample code, paste THIS file, click Deploy.
//   4. IMPORTANT: turn OFF JWT verification for this function, otherwise
//      Supabase rejects the request before it runs. Either untick
//      "Verify JWT" while creating it, or afterwards:
//      Edge Functions → ai-proxy → Settings → disable "Enforce JWT / Verify JWT".
//   5. In the app: AI Assistant → ⚙️ AI settings → Endpoint (advanced) →
//      https://audcuqjwpdqeyxvjyrin.supabase.co/functions/v1/ai-proxy
//      → Save. (Syncs to your other devices automatically.)
// ---------------------------------------------------------------------------

const UPSTREAM = "https://aikeys.maibornwolff.de";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const url = new URL(req.url);
    // Path after the function name, e.g. /ai-proxy/v1/chat/completions -> /v1/chat/completions
    const path = url.pathname.replace(/^\/ai-proxy/, "") || "/v1/chat/completions";

    // Forward only what the upstream needs (the client's aikeys Bearer key).
    const fwd = new Headers();
    const auth = req.headers.get("Authorization");
    if (auth) fwd.set("Authorization", auth);
    fwd.set("Content-Type", req.headers.get("Content-Type") || "application/json");

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await req.arrayBuffer() : undefined;

    const upstream = await fetch(UPSTREAM + path + url.search, {
      method: req.method,
      headers: fwd,
      body,
    });

    // Read the full body and set only clean headers — copying the upstream's
    // Content-Encoding/Content-Length onto a decoded body breaks the runtime.
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: upstream.status,
      headers: {
        ...CORS,
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (e) {
    // Surface the real error to the browser (with CORS) instead of a blank 500.
    return new Response(JSON.stringify({ error: "relay_error", detail: String(e) }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
