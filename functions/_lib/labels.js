// Known Ethereum addresses relevant to Asymmetry's treasury flows.
// Keys MUST be lowercase. Extend this list as new counterparties are identified.

export const TREASURY = "0xce352181c0f0350f1687e1a44c45bc9d96ee738b";

export const CVX_TOKEN      = "0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b";
export const CVX_LOCKER_V2  = "0x72a19342e8f1838460ebfccef09f6585e32db86e"; // vlCVX
export const CVXCRV_TOKEN   = "0x62b9c7356a2dc64a1969e19c23e4f579f9810aa7";
export const CRV_TOKEN      = "0xd533a949740bb3306d119cc777fa900ba034cd52";

// Votium / bribe infrastructure
export const VOTIUM_MULTIMERKLE_V1 = "0x378ba9b73309be80bf4c2c027aad799766a7ed5a";
export const VOTIUM_MULTIMERKLE_V2 = "0x9617f86b8d74b1d1e1cdeda38bd93cad3f68a8e7";
export const VOTIUM_VLCVX_DISTRIBUTOR = "0x34c7f1d540b5d0e3ecae00a29f6ef637b8e5be22";

// Asymmetry / USDaf related (confirmed via treasury tx patterns)
export const USDAF_MINTER   = "0x1771f4de6836b10b59dd66990b0190985df6673c"; // frequent USDaf inflow source — likely USDaf vault / borrower
export const ASYM_OPS       = "0x4bab8b679e242136a01387042c3918ea399fdb12"; // frequent mixed-token counterparty — ops / multisig
export const COW_SWAP       = "0x9008d19f58aabd9ed0d60971565aa8510560ab41"; // CoW Protocol settlement (used for buying CVX)
export const VOTIUM_PLATFORM = "0x63942e31e98f1833a234077f47880a66136a2d1e"; // Votium Platform deposit (bribes paid out)

export const LABELS = {
  [TREASURY]: { name: "Asymmetry Treasury", kind: "treasury" },

  [CVX_TOKEN]:     { name: "CVX", kind: "token" },
  [CVX_LOCKER_V2]: { name: "vlCVX Locker", kind: "convex" },
  [CVXCRV_TOKEN]:  { name: "cvxCRV", kind: "token" },
  [CRV_TOKEN]:     { name: "CRV", kind: "token" },

  [VOTIUM_MULTIMERKLE_V1]:    { name: "Votium (v1 stash)",        kind: "votium" },
  [VOTIUM_MULTIMERKLE_V2]:    { name: "Votium (v2 stash)",        kind: "votium" },
  [VOTIUM_VLCVX_DISTRIBUTOR]: { name: "Votium vlCVX Distributor", kind: "votium" },
  [VOTIUM_PLATFORM]:          { name: "Votium Platform (deposit)", kind: "votium" },

  [USDAF_MINTER]: { name: "USDaf Vault",         kind: "asymmetry" },
  [ASYM_OPS]:     { name: "Asymmetry Ops",       kind: "asymmetry" },
  [COW_SWAP]:     { name: "CoW Swap (settle)",   kind: "dex" },
};

// Return { name, kind } or a fallback with truncated address.
export function labelFor(address) {
  if (!address) return { name: "Unknown", kind: "unknown" };
  const lower = address.toLowerCase();
  if (LABELS[lower]) return LABELS[lower];
  return { name: `${address.slice(0, 6)}…${address.slice(-4)}`, kind: "unknown" };
}
