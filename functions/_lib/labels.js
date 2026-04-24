// Known Ethereum addresses relevant to Asymmetry's treasury flows.
// Keys MUST be lowercase. Extend this list as new counterparties are identified.

export const TREASURY = "0xce352181c0f0350f1687e1a44c45bc9d96ee738b";

// --- Convex / Curve ---
export const CVX_TOKEN      = "0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b";
export const CVX_LOCKER_V2  = "0x72a19342e8f1838460ebfccef09f6585e32db86e"; // vlCVX
export const CVXCRV_TOKEN   = "0x62b9c7356a2dc64a1969e19c23e4f579f9810aa7";
export const CRV_TOKEN      = "0xd533a949740bb3306d119cc777fa900ba034cd52";

// --- Pendle / Stake DAO ---
export const PENDLE_TOKEN   = "0x808507121b80c02388fad14726482e061b8da827";
export const SDPENDLE       = "0x5ea630e00d6ee438d3dea1556a110359acdc10a9"; // Stake DAO liquid-locked Pendle (sdPENDLE)
export const SDPENDLE_GAUGE = "0x50dc9ae51f78c593d4138263da7088a973b8184e"; // staked sdPENDLE — grants voting power on sdpendle.eth

// --- Liquity (LQTY — the third pillar of Roman's "only a few protocols worth tracking") ---
export const LQTY_TOKEN      = "0x6dea81c8171d0ba574754ef6f8b412f2ed88c54d";
export const LQTY_GOVERNANCE = "0x807def5e7d057df05c796f4bc75c3fe82bd6eee1"; // Liquity v2 Governance — LQTY stakers allocate votes to initiatives here

// --- Votium / bribe infrastructure ---
export const VOTIUM_MULTIMERKLE_V1    = "0x378ba9b73309be80bf4c2c027aad799766a7ed5a";
export const VOTIUM_MULTIMERKLE_V2    = "0x9617f86b8d74b1d1e1cdeda38bd93cad3f68a8e7";
export const VOTIUM_VLCVX_DISTRIBUTOR = "0x34c7f1d540b5d0e3ecae00a29f6ef637b8e5be22";
export const VOTIUM_PLATFORM          = "0x63942e31e98f1833a234077f47880a66136a2d1e"; // bribes deposited here direct votes

// --- Asymmetry / USDaf ---
export const USDAF_TOKEN            = "0x9cf12ccd6020b6888e4d4c4e4c7aca33c1eb91f8"; // USDaf stablecoin (BoldToken fork)
export const USDAF_TOKEN_LEGACY     = "0x85e30b8b263bc64d94b827ed450f2edfee8579da"; // older USDaf deploy — rarely seen
export const USDAF_INTEREST_ROUTER  = "0x1771f4de6836b10b59dd66990b0190985df6673c"; // Liquity-v2 InterestRouter — forwards USDaf borrower interest to the treasury (POL rev share)
export const ASYM_OPS               = "0x4bab8b679e242136a01387042c3918ea399fdb12";
export const COW_SWAP               = "0x9008d19f58aabd9ed0d60971565aa8510560ab41";

// Voting tokens currently tracked. Each entry represents a position where the
// treasury has (or could have) governance power. Extend this list as new
// positions are taken — the UI will automatically render a card for any entry
// with a non-zero on-chain balance.
//   address  — contract whose balanceOf(treasury) is the voting weight
//   space    — Snapshot space where that weight can be cast (nullable)
//   coingeckoId — used to price the position in USD (nullable)
export const VOTING_TOKENS = [
  {
    symbol: "vlCVX",
    name: "vote-locked CVX",
    address: CVX_LOCKER_V2,
    ecosystem: "Convex",
    space: "cvx.eth",
    coingeckoId: "convex-finance",
    decimals: 18,
  },
  {
    symbol: "sdPENDLE-gauge",
    name: "staked sdPENDLE",
    address: SDPENDLE_GAUGE,
    ecosystem: "Stake DAO · Pendle",
    space: "sdpendle.eth",
    coingeckoId: "stake-dao-pendle",
    decimals: 18,
  },
  {
    symbol: "sdPENDLE",
    name: "sdPENDLE (unstaked)",
    address: SDPENDLE,
    ecosystem: "Stake DAO · Pendle",
    space: null,
    coingeckoId: "stake-dao-pendle",
    decimals: 18,
  },
  {
    symbol: "LQTY",
    name: "Liquity governance token",
    address: LQTY_TOKEN,
    ecosystem: "Liquity v2",
    space: "liquity.eth",
    coingeckoId: "liquity",
    decimals: 18,
  },
];

// Snapshot spaces to query for treasury votes (direct + delegated).
// Roman's shortlist was CVX, Pendle, LQTY.
export const VOTE_SPACES = [
  "cvx.eth",
  "sdpendle.eth",
  "sdcrv.eth",
  "sdbal.eth",
  "sdfxs.eth",
  "liquity.eth",
];

// Per-space Snapshot vote delegates. The treasury has delegated its cvx.eth
// voting to a signer on a Gnosis Safe — that signer's votes represent our
// vlCVX voting power at the snapshot block. Verified via the Snapshot
// delegation registry (0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446): for
// cvx.eth the treasury → 0x4066745373081b224fb36b1ff82fa991a636610e.
// Append entries as new delegations are set up.
export const VOTE_DELEGATES = {
  "cvx.eth": "0x4066745373081b224fb36b1ff82fa991a636610e",
};

export const LABELS = {
  [TREASURY]: { name: "Asymmetry Treasury", kind: "treasury" },

  // --- tokens ---
  [CVX_TOKEN]:          { name: "CVX",     kind: "token" },
  [CVXCRV_TOKEN]:       { name: "cvxCRV",  kind: "token" },
  [CRV_TOKEN]:          { name: "CRV",     kind: "token" },
  [PENDLE_TOKEN]:       { name: "PENDLE",  kind: "token" },
  [SDPENDLE]:           { name: "sdPENDLE", kind: "token" },
  [USDAF_TOKEN]:        { name: "USDaf",   kind: "token" },
  [USDAF_TOKEN_LEGACY]: { name: "USDaf (legacy deploy)", kind: "token" },

  // --- voting power ---
  [CVX_LOCKER_V2]:  { name: "vlCVX Locker",   kind: "voting" },
  [SDPENDLE_GAUGE]: { name: "sdPENDLE gauge", kind: "voting" },

  // --- Votium ---
  [VOTIUM_MULTIMERKLE_V1]:    { name: "Votium (v1 stash)",         kind: "votium" },
  [VOTIUM_MULTIMERKLE_V2]:    { name: "Votium (v2 stash)",         kind: "votium" },
  [VOTIUM_VLCVX_DISTRIBUTOR]: { name: "Votium vlCVX Distributor",  kind: "votium" },
  [VOTIUM_PLATFORM]:          { name: "Votium Platform (deposit)", kind: "votium" },

  // --- Asymmetry / counterparties ---
  [USDAF_INTEREST_ROUTER]: { name: "USDaf InterestRouter · rev share", kind: "revshare" },
  [ASYM_OPS]:              { name: "Asymmetry Ops",                   kind: "asymmetry" },
  [COW_SWAP]:              { name: "CoW Swap (settle)",               kind: "dex" },
};

// Return { name, kind } or a fallback with truncated address.
export function labelFor(address) {
  if (!address) return { name: "Unknown", kind: "unknown" };
  const lower = address.toLowerCase();
  if (LABELS[lower]) return LABELS[lower];
  return { name: `${address.slice(0, 6)}…${address.slice(-4)}`, kind: "unknown" };
}

// Heuristic for flagging unknown tokens that *might* carry voting power — used
// as a hint in the revenue feed so new ecosystems surface without a code change.
// Pragmatic approach per Roman: match the prefixes that gov-locker tokens
// actually use (ve/vl/aura for escrow-style, -gauge suffix for Stake DAO
// gauge-staked positions, stkAAVE-style "stk" prefix, bpt-ve Balancer wraps).
// Deliberately skips yield-token prefixes (s*/y*) to avoid false positives on
// things like sUSDe / yvDAI.
const VOTING_TOKEN_HINT = [
  /^(ve|vl|aura|bpt-ve|stk)[A-Z0-9]/,
  /-gauge$/i,
];
export function looksLikeVotingToken(symbol) {
  if (typeof symbol !== "string") return false;
  return VOTING_TOKEN_HINT.some((re) => re.test(symbol));
}
