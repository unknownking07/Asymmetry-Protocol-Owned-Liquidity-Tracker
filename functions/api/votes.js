// Cloudflare Pages Function: fetch Snapshot votes cast by the treasury across
// every space we track, and resolve each vote's `choice` into actual gauge
// names + weights so the UI can show where the voting power is pointed.
//
// The Asymmetry treasury votes directly on sdpendle.eth (and will pick up more
// spaces as positions grow) — Convex votes mostly flow through Votium, so
// cvx.eth is usually empty for this wallet.

import { VOTE_SPACES } from "../_lib/labels.js";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const address = (url.searchParams.get("address") || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return json({ error: "bad address" }, 400);
  }

  const cacheKey = new Request(`https://cache.snapshot/v2/${address}`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

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

  let votes = [];
  try {
    const r = await fetch("https://hub.snapshot.org/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { voter: address, spaces: VOTE_SPACES } }),
    });
    const j = await r.json();
    votes = (j.data?.votes || []).map(shapeVote);
  } catch (e) {
    return json({ votes: [], error: String(e) }, 200);
  }

  const resp = json({ votes }, 200, 300);
  await cache.put(cacheKey, resp.clone());
  return resp;
}

// Normalize a Snapshot vote into { date, space, round, title, allocations[], vp, proposalId }.
// `allocations` is the choice object resolved against proposal.choices and
// sorted by weight descending — so the caller can render the top N gauges.
function shapeVote(v) {
  const choices = v.proposal?.choices || [];
  const title = v.proposal?.title || "";
  const allocations = resolveAllocations(v.choice, choices);
  const roundMatch =
    title.match(/Round\s+(\d+)/i) ||
    title.match(/Vote\s+ID:\s*(\d+)/i) ||
    title.match(/(\d{1,2}\/\d{1,2}\/\d{4})/); // Pendle date-range proposals

  return {
    date: new Date(v.created * 1000).toISOString().slice(0, 10),
    space: v.space?.id || "?",
    round: roundMatch?.[1] || "",
    title,
    type: v.proposal?.type || "unknown",
    allocations: allocations.slice(0, 10),
    gaugeCount: allocations.length,
    vp: v.vp ?? null,
    proposalId: v.proposal?.id,
  };
}

// choice values come in multiple shapes depending on proposal.type:
//   single-choice / basic:  choice = 1                 (1-indexed)
//   approval:               choice = [1, 3, 5]
//   weighted / quadratic:   choice = { "1": 50, "3": 25 }
// All choice indices are 1-based into the proposal.choices array.
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
