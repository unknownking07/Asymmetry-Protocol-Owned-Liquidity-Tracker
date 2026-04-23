// Cloudflare Pages Function: fetch Convex Snapshot votes cast by the treasury.
// Uses Snapshot public GraphQL — no key needed.

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const address = (url.searchParams.get("address") || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return new Response(JSON.stringify({ error: "bad address" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const query = `
    query Votes($voter: String!) {
      votes(first: 20, where: { voter: $voter, space_in: ["cvx.eth"] }, orderBy: "created", orderDirection: desc) {
        id
        created
        choice
        proposal { id title }
      }
    }`;

  const cacheKey = new Request(`https://cache.snapshot/${address}`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const r = await fetch("https://hub.snapshot.org/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { voter: address } }),
    });
    const j = await r.json();
    const votes = (j.data?.votes || []).map((v, i) => ({
      date: new Date(v.created * 1000).toISOString().slice(0, 10),
      round: (v.proposal?.title || "").match(/Round\s+(\d+)/i)?.[1] || "?",
      choice: typeof v.choice === "object" ? `${Object.keys(v.choice).length} gauges` : `Choice ${v.choice}`,
      proposalId: v.proposal?.id,
    }));
    const resp = new Response(JSON.stringify({ votes }), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
    await cache.put(cacheKey, resp.clone());
    return resp;
  } catch (e) {
    return new Response(JSON.stringify({ votes: [], error: String(e) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}
