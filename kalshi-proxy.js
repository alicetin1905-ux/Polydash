/**
 * kalshi-proxy — Cloudflare Worker
 * Read-only CORS proxy for Kalshi's public market-data API.
 *
 * Why: Kalshi serves market data without auth, but does NOT send browser
 * CORS headers, so a static page (GitHub Pages) can't fetch it directly.
 * This Worker forwards GET /trade-api/v2/* to Kalshi and adds CORS.
 *
 * Deploy (≈2 min, free):
 *   1. dash.cloudflare.com → Workers & Pages → Create → Create Worker
 *   2. Name it (e.g. kalshi-proxy) → Deploy
 *   3. Click "Edit code", paste this whole file, Deploy
 *   4. Copy the URL (https://kalshi-proxy.<you>.workers.dev)
 *   5. Paste that URL into PARITY's "Kalshi via" field
 *
 * It only proxies Kalshi read paths — it is not an open proxy.
 */

const KALSHI_HOST = "https://api.elections.kalshi.com"; // swap to https://trading-api.kalshi.com if Kalshi moves it
const ALLOWED_PREFIX = "trade-api/v2/";                  // markets, events, series, orderbook (all read-only GET)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== "GET") {
      return json({ error: "Only GET is proxied." }, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, "");

    if (!path.startsWith(ALLOWED_PREFIX)) {
      return json({ error: `Only ${ALLOWED_PREFIX}* paths are proxied.` }, 400);
    }

    const target = `${KALSHI_HOST}/${path}${url.search}`;

    try {
      const upstream = await fetch(target, {
        method: "GET",
        headers: { Accept: "application/json" },
        // light edge cache so rapid rescans don't hammer Kalshi
        cf: { cacheTtl: 8, cacheEverything: true },
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=8" },
      });
    } catch (err) {
      return json({ error: "Upstream fetch failed", detail: String(err) }, 502);
    }
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
