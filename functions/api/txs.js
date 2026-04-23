// Cloudflare Pages Function: proxy Etherscan V2 tokentx for the treasury wallet.
// Kept for backwards-compat; /api/treasury is the primary aggregator.

import { tokenTx } from "../_lib/etherscan.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return new Response(JSON.stringify({ error: "bad address" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  if (!env.ETHERSCAN_API_KEY) {
    return new Response(JSON.stringify({ error: "missing ETHERSCAN_API_KEY" }), { status: 501, headers: { "content-type": "application/json" } });
  }

  const cacheKey = new Request(`https://cache/etherscan-tokentx-${address}`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const result = await tokenTx(address, env.ETHERSCAN_API_KEY, { offset: 30 });
    const resp = new Response(JSON.stringify({ result }), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
    });
    await cache.put(cacheKey, resp.clone());
    return resp;
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { "content-type": "application/json" } });
  }
}
