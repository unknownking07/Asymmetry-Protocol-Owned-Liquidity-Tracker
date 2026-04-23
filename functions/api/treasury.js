// Main aggregator endpoint.
// Fetches token transfers for the treasury wallet and categorizes them into:
//   locks    — POL purchases (CVX treasury -> CvxLockerV2)
//   claims   — inbound from Votium / bribe contracts
//   revenue  — all other inflows (labeled by source)
//   outflows — all outbound (labeled by destination)
// Cached at the edge for 60s.

import { tokenTx, toDecimal } from "../_lib/etherscan.js";
import {
  TREASURY, CVX_TOKEN, CVX_LOCKER_V2,
  VOTIUM_MULTIMERKLE_V1, VOTIUM_MULTIMERKLE_V2, VOTIUM_VLCVX_DISTRIBUTOR,
  labelFor,
} from "../_lib/labels.js";

import { VOTIUM_PLATFORM } from "../_lib/labels.js";

const VOTIUM_CLAIM_SET = new Set([
  VOTIUM_MULTIMERKLE_V1.toLowerCase(),
  VOTIUM_MULTIMERKLE_V2.toLowerCase(),
  VOTIUM_VLCVX_DISTRIBUTOR.toLowerCase(),
]);
const VOTIUM_DEPOSIT_SET = new Set([
  VOTIUM_PLATFORM.toLowerCase(),
]);

export async function onRequestGet({ env, request }) {
  if (!env.ETHERSCAN_API_KEY) {
    return json({ error: "missing ETHERSCAN_API_KEY" }, 501);
  }

  const cacheKey = new Request("https://cache/asym-treasury-v3", { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let txs;
  try {
    txs = await tokenTx(TREASURY, env.ETHERSCAN_API_KEY, { offset: 300 });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }

  const locks      = [];
  const claims     = [];
  const bribesPaid = [];
  const revenue    = [];
  const outflows   = [];

  for (const t of txs) {
    const amount = toDecimal(t.value, t.tokenDecimal);
    const date = new Date(parseInt(t.timeStamp) * 1000).toISOString().slice(0, 10);
    const symbol = t.tokenSymbol || "?";
    const from = (t.from || "").toLowerCase();
    const to   = (t.to   || "").toLowerCase();
    const isOut = from === TREASURY.toLowerCase();
    const counterparty = isOut ? to : from;
    const label = labelFor(counterparty);

    const row = {
      date,
      ts: parseInt(t.timeStamp),
      hash: t.hash,
      amount,
      symbol,
      contract: t.contractAddress,
      counterparty,
      label,
    };

    // POL purchases — CVX transfers from treasury into the locker.
    if (isOut && to === CVX_LOCKER_V2.toLowerCase() && t.contractAddress.toLowerCase() === CVX_TOKEN.toLowerCase()) {
      locks.push(row);
      continue;
    }

    if (!isOut && VOTIUM_CLAIM_SET.has(from)) {
      claims.push(row);
      continue;
    }

    // Outbound to Votium Platform = bribes deposited (allocations — directs votes)
    if (isOut && VOTIUM_DEPOSIT_SET.has(to)) {
      bribesPaid.push(row);
      continue;
    }

    if (isOut) outflows.push(row);
    else       revenue.push(row);
  }

  // Chronological ascending for locks (chart); desc for the rest (feed).
  locks.sort((a, b) => a.ts - b.ts);
  let running = 0;
  for (const L of locks) {
    running += L.amount;
    L.cumulative = running;
  }

  const body = {
    treasury: TREASURY,
    updated: new Date().toISOString(),
    locks,
    claims,
    bribesPaid,
    revenue,
    outflows,
    summary: {
      vlcvxAccrued: running,
      lockCount: locks.length,
      claimCount: claims.length,
      bribesPaidCount: bribesPaid.length,
      inflowCount: revenue.length,
      outflowCount: outflows.length,
    },
  };

  const resp = json(body, 200, 60);
  await cache.put(cacheKey, resp.clone());
  return resp;
}

function json(obj, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}
