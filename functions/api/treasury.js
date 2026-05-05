// Main aggregator endpoint.
// Fetches token transfers for the treasury wallet and categorizes them into:
//   locks    — POL purchases (CVX treasury -> CvxLockerV2)
//   claims   — inbound from Votium / bribe contracts
//   bribes   — outbound to Votium Platform (directs votes)
//   revShare — inbound from known rev-share sources (USDaf InterestRouter etc.)
//   revenue  — all other inflows (labeled by source)
//   outflows — all outbound (labeled by destination)
// Cached at the edge for 60s.

import { tokenTx, toDecimal } from "../_lib/etherscan.js";
import {
  TREASURY, CVX_TOKEN, CVX_LOCKER_V2,
  VOTIUM_MULTIMERKLE_V1, VOTIUM_MULTIMERKLE_V2, VOTIUM_VLCVX_DISTRIBUTOR,
  VOTIUM_PLATFORM, USDAF_INTEREST_ROUTER, OPASF_TOKEN, OPASF_REDEMPTION_SAFE,
  VOTING_TOKENS,
  labelFor, looksLikeVotingToken,
} from "../_lib/labels.js";

const VOTIUM_CLAIM_SET = new Set([
  VOTIUM_MULTIMERKLE_V1.toLowerCase(),
  VOTIUM_MULTIMERKLE_V2.toLowerCase(),
  VOTIUM_VLCVX_DISTRIBUTOR.toLowerCase(),
]);
const VOTIUM_DEPOSIT_SET = new Set([VOTIUM_PLATFORM.toLowerCase()]);
const REVSHARE_SET = new Set([USDAF_INTEREST_ROUTER.toLowerCase()]);
// opASF exercise sources — addresses that send USDaf to the treasury when
// investors redeem opASF for ASF. The Redemption Safe is the active collector
// (verified: 50+ distinct inbound USDaf senders that forward consolidated
// chunks to the treasury on the same dates as POL purchases). The opASF token
// itself is included as a safety net — its current implementation doesn't
// transfer USDaf directly, but a future redeemer module might use it.
const OPASF_SOURCE_SET = new Set([
  OPASF_TOKEN.toLowerCase(),
  OPASF_REDEMPTION_SAFE.toLowerCase(),
]);
const VOTING_TOKEN_SET = new Set(VOTING_TOKENS.map(t => t.address.toLowerCase()));

export async function onRequestGet({ env, request }) {
  if (!env.ETHERSCAN_API_KEY) {
    return json({ error: "missing ETHERSCAN_API_KEY" }, 501);
  }

  const cacheKey = new Request("https://cache/asym-treasury-v6", { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let txs;
  try {
    txs = await tokenTx(TREASURY, env.ETHERSCAN_API_KEY, { offset: 300 });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }

  const locks         = [];
  const claims        = [];
  const bribesPaid    = [];
  const revShare      = [];
  const opasfInvests  = [];
  const revenue       = [];
  const outflows      = [];

  // Per voting-token activity — used to show "held Oct 2025 → Jan 2026" on
  // dormant cards. Collect every transfer touching the token contract, then
  // sort ascending and fold to compute running balance history.
  const votingActivity = {};
  for (const addr of VOTING_TOKEN_SET) votingActivity[addr] = [];

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
      looksVoting: looksLikeVotingToken(symbol),
    };

    const contractLower = (t.contractAddress || "").toLowerCase();
    if (VOTING_TOKEN_SET.has(contractLower)) {
      votingActivity[contractLower].push({ ts: row.ts, date, amount, isOut });
    }

    // POL purchases — CVX transfers from treasury into the locker.
    if (isOut && to === CVX_LOCKER_V2.toLowerCase() && t.contractAddress.toLowerCase() === CVX_TOKEN.toLowerCase()) {
      locks.push(row);
      continue;
    }

    // Votium bribe claims (inbound).
    if (!isOut && VOTIUM_CLAIM_SET.has(from)) {
      claims.push(row);
      continue;
    }

    // Bribes paid to direct votes (outbound to Votium Platform).
    if (isOut && VOTIUM_DEPOSIT_SET.has(to)) {
      bribesPaid.push(row);
      continue;
    }

    // Rev share — protocol revenue forwarded to the POL treasury.
    if (!isOut && REVSHARE_SET.has(from)) {
      revShare.push(row);
      continue;
    }

    // opASF exercise proceeds — USDaf investors paid in to redeem opASF for ASF.
    if (!isOut && OPASF_SOURCE_SET.has(from)) {
      opasfInvests.push(row);
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

  // Rev-share totals by symbol so the UI can show "USDaf earned from POL".
  const revShareBySymbol = {};
  for (const r of revShare) {
    revShareBySymbol[r.symbol] = (revShareBySymbol[r.symbol] || 0) + r.amount;
  }

  // opASF investment totals by symbol — should be USDaf, but keep shape generic.
  const opasfInvestsBySymbol = {};
  for (const r of opasfInvests) {
    opasfInvestsBySymbol[r.symbol] = (opasfInvestsBySymbol[r.symbol] || 0) + r.amount;
  }

  // Fold each voting-token's transfer list into { firstHeld, lastHeld, peak }
  // so the UI can annotate dormant cards with "held Oct 2025 → Jan 2026".
  const votingTokenHistory = {};
  for (const [contract, events] of Object.entries(votingActivity)) {
    if (events.length === 0) continue;
    events.sort((a, b) => a.ts - b.ts);
    let running = 0;
    let peak = 0;
    let firstHeld = null;
    let lastHeld = null;
    for (const ev of events) {
      const prev = running;
      running += ev.isOut ? -ev.amount : ev.amount;
      if (running > peak) peak = running;
      // Any event that occurs while the position is / was open counts toward
      // the held window — including the outflow that closes the position.
      if (prev > 0.0001 || running > 0.0001) {
        if (!firstHeld) firstHeld = ev.date;
        lastHeld = ev.date;
      }
    }
    if (peak > 0) {
      votingTokenHistory[contract] = {
        firstHeld,
        lastHeld,
        peak,
        events: events.length,
      };
    }
  }

  const body = {
    treasury: TREASURY,
    updated: new Date().toISOString(),
    locks,
    claims,
    bribesPaid,
    revShare,
    opasfInvests,
    revenue,
    outflows,
    votingTokenHistory,
    summary: {
      vlcvxAccrued: running,
      lockCount: locks.length,
      claimCount: claims.length,
      bribesPaidCount: bribesPaid.length,
      revShareCount: revShare.length,
      revShareBySymbol,
      opasfInvestCount: opasfInvests.length,
      opasfInvestsBySymbol,
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
