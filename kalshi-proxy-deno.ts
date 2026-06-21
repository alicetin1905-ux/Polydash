// kalshi-proxy-deno.ts — Deno Deploy
// Read-only CORS proxy for Kalshi's public market-data API.
//
// Why this over a Cloudflare Worker: Kalshi sits behind Cloudflare. A Worker's
// outbound call is Cloudflare→Cloudflare and can still get 403'd. Deno Deploy
// runs on Google Cloud IPs that Kalshi treats as ordinary API traffic — the same
// kind of host every Kalshi bot reads market data from.
//
// Deploy (~30 sec, free):
//   1. dash.deno.com  →  New Playground
//   2. Paste this whole file  →  Save & Deploy
//   3. Copy the URL it gives you  (https://<name>.deno.dev)
//   4. Paste that URL into PARITY's "Kalshi via" field
//
// It only proxies Kalshi read paths (/trade-api/v2/*). It is not an open proxy.

const KALSHI_HOST = "https://trading-api.kalshi.com"; // alt: https://api.elections.kalshi.com
const ALLOWED = "/trade-api/v2/";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type, Accept",
  "access-control-max-age": "86400",
};

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return json({ error: "Only GET is proxied." }, 405);

  const url = new URL(req.url);
  if (!url.pathname.startsWith(ALLOWED)) {
    return json({ error: `Only ${ALLOWED}* paths are proxied.` }, 400);
  }

  const target = KALSHI_HOST + url.pathname + url.search;
  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS, "content-type": "application/json", "cache-control": "public, max-age=8" },
    });
  } catch (e) {
    return json({ error: "upstream fetch failed", detail: String(e) }, 502);
  }
});
