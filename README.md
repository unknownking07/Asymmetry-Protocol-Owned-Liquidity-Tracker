# Asymmetry POL Tracker

**Live:** https://asym-pol-tracker.pages.dev

An unofficial community dashboard for the [Asymmetry Finance](https://asymmetry.finance) treasury
wallet (`0xce352181c0f0350f1687e1a44c45bc9d96ee738b`). Tracks:

- **vlCVX War Chest** — live balance, USD value, chart of every lock event
- **POL Purchases** — all `CVX → vlCVX` lock events with dates + Etherscan links
- **Convex Votes** — gauge votes cast on Snapshot (`cvx.eth`)
- **Allocations** — bribes deposited to Votium Platform to direct votes
- **Revenue Streams** — every inflow, categorized by source
- **Recent Activity** — outbound transfers

All data is pulled live from public sources — no centralized backend, no database.

## Stack

| | |
|---|---|
| Hosting | Cloudflare Pages (free tier) |
| Backend | Cloudflare Pages Functions (edge serverless, free) |
| RPC | `ethereum-rpc.publicnode.com` → `eth.drpc.org` fallback chain |
| Prices | CoinGecko public API |
| On-chain history | Etherscan V2 API |
| Votes | Snapshot GraphQL (`cvx.eth` space) |
| Frontend | Plain HTML + CSS + ES modules. No build step, no framework. |

## Local development

```bash
git clone https://github.com/unknownking07/Asymmetry-Protocol-Owned-Liquidity-Tracker.git
cd Asymmetry-Protocol-Owned-Liquidity-Tracker
npm install
cp .dev.vars.example .dev.vars     # then edit to add your Etherscan API key
npm run dev                         # starts http://localhost:8788
```

Get a free Etherscan API key at https://etherscan.io/apis — only needed for the
Allocations / Revenue / Recent Activity panels (balances and chart data work
without it).

## Deploying your own fork

1. Sign up for a free Cloudflare account.
2. `npx wrangler login`
3. `npx wrangler pages project create asym-pol-tracker --production-branch=main`
4. `npm run deploy`
5. Add your Etherscan key as a production secret:
   ```bash
   echo -n "YOUR_KEY" | npx wrangler pages secret put ETHERSCAN_API_KEY --project-name=asym-pol-tracker
   ```
6. Redeploy once more: `npm run deploy`

Free `*.pages.dev` subdomain is assigned automatically. For a custom domain,
attach it in the Cloudflare dashboard under Pages → Custom domains.

## Project layout

```
public/
  index.html         dashboard markup + OG / Twitter card meta
  style.css          Asymmetry-inspired cream + blue theme
  app.js             client-side logic (balances, chart, panels)
  pol.jpg            logo + favicon source
  og.jpg             1200x630 social preview image
functions/
  _lib/
    etherscan.js     V2 API wrapper
    labels.js        known Ethereum address → label map
  api/
    treasury.js      main aggregator (locks, claims, bribes, revenue, outflows)
    votes.js         Snapshot votes proxy
    txs.js           thin tokentx proxy (legacy)
wrangler.toml        Cloudflare Pages config
package.json         dev / deploy scripts
.dev.vars.example    local env var template
```

## Keeping the label map accurate

`functions/_lib/labels.js` maps known counterparty addresses (CoW Swap, Votium,
USDaf vault, etc.) to human-readable names. When new contracts show up in the
Revenue or Recent Activity panels with a truncated address (e.g. `0xa927…2501`),
add them to `LABELS` and redeploy.

## Contributing

PRs welcome, especially for:

- Additional address labels (afCVX, opASF, new USDaf contracts, etc.)
- Extra panels (gauge weight breakdown, APR tracking, USDaf metrics)
- On-chain vote detection beyond Snapshot
- Auto-refresh / websocket updates

## Disclaimer

Unofficial. Not affiliated with Asymmetry Finance. The source of truth is
the wallet itself on
[Etherscan](https://etherscan.io/address/0xce352181c0f0350f1687e1a44c45bc9d96ee738b) /
[DeBank](https://debank.com/profile/0xce352181c0f0350f1687e1a44c45bc9d96ee738b).
Not financial advice.

Built by [@abhiontwt](https://x.com/abhiontwt) for the ASYM community.
