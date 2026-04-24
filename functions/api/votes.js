// Cloudflare Pages Function: fetch Snapshot votes that represent the
// treasury's voting power — both direct votes AND votes cast by delegates
// (e.g. vlCVX is delegated to a Safe that casts the weekly cvx.eth vote).
// Each vote's `choice` is resolved into gauge-name allocations so the UI
// can show where the voting power is pointed.

import { VOTE_SPACES, VOTE_DELEGATES } from "../_lib/labels.js";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const address = (url.searchParams.get("address") || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return json({ error: "bad address" }, 400);
  }

  const cacheKey = new Request(`https://cache.snapshot/v3/${address}`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Direct votes by the treasury, plus the votes cast by each configured
  // delegate in the space they're delegated for. Fetched in parallel.
  const delegatePairs = Object.entries(VOTE_DELEGATES)
    .map(([space, addr]) => ({ space, addr: addr.toLowerCase() }));

  const [directRaw, ...delegateRaws] = await Promise.all([
    fetchVotesFor(address, VOTE_SPACES),
    ...delegatePairs.map(p => fetchVotesFor(p.addr, [p.space])),
  ]);

  const direct = (directRaw || []).map(v => shapeVote(v, { source: "direct" }));
  const delegated = delegatePairs.flatMap((p, i) => {
    return (delegateRaws[i] || []).map(v => shapeVote(v, {
      source: "delegated",
      delegate: p.addr,
    }));
  });

  // Combine, drop dupes (unlikely but cheap), sort newest first.
  const seen = new Set();
  const votes = [...direct, ...delegated]
    .filter(v => {
      const k = v.proposalId + "|" + v.source;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.ts - a.ts);

  const resp = json({ votes }, 200, 300);
  await cache.put(cacheKey, resp.clone());
  return resp;
}

async function fetchVotesFor(voter, spaces) {
  if (!voter || !spaces.length) return [];
  const query = `
    query Votes($voter: String!, $spaces: [String]!) {
      votes(
        first: 40,
        where: { voter: $voter, space_in: $spaces },
        orderBy: "created",
        orderDirection: desc
      ) {
        id
        created
        choice
        vp
        space { id }
        proposal { id title type choices }
      }
    }`;
  try {
    const r = await fetch("https://hub.snapshot.org/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { voter, spaces } }),
    });
    const j = await r.json();
    return j.data?.votes || [];
  } catch (e) {
    console.warn("snapshot fetch failed", voter, spaces, e);
    return [];
  }
}

// Normalize a Snapshot vote into the shape the UI expects.
function shapeVote(v, extra = {}) {
  const choices = v.proposal?.choices || [];
  const title = v.proposal?.title || "";
  const allocations = resolveAllocations(v.choice, choices);
  const roundMatch =
    title.match(/Round\s+(\d+)/i) ||
    title.match(/Vote\s+ID:\s*(\d+)/i) ||
    title.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);

  return {
    ts: v.created,
    date: new Date(v.created * 1000).toISOString().slice(0, 10),
    space: v.space?.id || "?",
    round: roundMatch?.[1] || "",
    title,
    type: v.proposal?.type || "unknown",
    allocations: allocations.slice(0, 10),
    gaugeCount: allocations.length,
    vp: v.vp ?? null,
    proposalId: v.proposal?.id,
    ...extra,
  };
}

// choice values come in multiple shapes depending on proposal.type:
//   single-choice / basic:  choice = 1                 (1-indexed)
//   approval:               choice = [1, 3, 5]
//   weighted / quadratic:   choice = { "1": 50, "3": 25 }
function resolveAllocations(choice, choices) {
  if (choice == null || choices.length === 0) return [];

  if (typeof choice === "number") {
    const gauge = choices[choice - 1];
    return gauge ? [{ gauge, pct: 100, weight: 1 }] : [];
  }

  if (Array.isArray(choice)) {
    const pct = 100 / choice.length;
    return choice
      .map((i) => ({ gauge: choices[i - 1], pct, weight: 1 }))
      .filter((a) => a.gauge);
  }

  if (typeof choice === "object") {
    const entries = Object.entries(choice)
      .map(([k, w]) => ({ idx: parseInt(k, 10), weight: Number(w) }))
      .filter((e) => !Number.isNaN(e.idx) && e.weight > 0);
    const total = entries.reduce((s, e) => s + e.weight, 0) || 1;
    return entries
      .map((e) => ({
        gauge: choices[e.idx - 1],
        pct: (e.weight / total) * 100,
        weight: e.weight,
      }))
      .filter((a) => a.gauge)
      .sort((a, b) => b.pct - a.pct);
  }

  return [];
}

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}
