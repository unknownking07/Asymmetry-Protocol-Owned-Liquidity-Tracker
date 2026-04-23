// Thin wrapper around Etherscan V2.
// https://docs.etherscan.io/v2-migration

const BASE = "https://api.etherscan.io/v2/api";
const CHAIN = 1; // mainnet

export async function etherscan(params, apiKey) {
  const qs = new URLSearchParams({ chainid: String(CHAIN), apikey: apiKey, ...params });
  const r = await fetch(`${BASE}?${qs}`);
  if (!r.ok) throw new Error(`etherscan ${r.status}`);
  const j = await r.json();
  // Etherscan returns status "0" with message "No transactions found" even when ok.
  if (j.status === "0" && j.message && !/No transactions found/i.test(j.message)) {
    throw new Error(`etherscan: ${j.message} — ${JSON.stringify(j.result).slice(0, 200)}`);
  }
  return Array.isArray(j.result) ? j.result : [];
}

// Fetch all ERC-20 transfers touching `address`, most-recent first.
export async function tokenTx(address, apiKey, { page = 1, offset = 100 } = {}) {
  return etherscan({
    module: "account",
    action: "tokentx",
    address,
    page: String(page),
    offset: String(offset),
    sort: "desc",
  }, apiKey);
}

// Fetch normal ETH transactions for `address`.
export async function txList(address, apiKey, { page = 1, offset = 50 } = {}) {
  return etherscan({
    module: "account",
    action: "txlist",
    address,
    page: String(page),
    offset: String(offset),
    sort: "desc",
  }, apiKey);
}

// Normalize an Etherscan tx value + decimals into a number.
export function toDecimal(value, decimals) {
  try { return Number(BigInt(value)) / Math.pow(10, Number(decimals || 18)); }
  catch { return 0; }
}
