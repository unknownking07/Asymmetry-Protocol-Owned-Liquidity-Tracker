// Asymmetry POL Tracker — unofficial. Static client-side script.

const TREASURY = "0xce352181c0f0350f1687e1a44c45bc9d96ee738b";
const CVX_LOCKER_V2 = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const CVX_TOKEN = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";

// Voting tokens tracked client-side. Mirrors functions/_lib/labels.js —
// extend here when you add a new entry there.
const VOTING_TOKENS = [
  {
    symbol: "vlCVX",
    name: "vote-locked CVX",
    address: "0x72a19342e8F1838460eBFCCEf09F6585e32db86E",
    ecosystem: "Convex",
    space: "cvx.eth",
    coingeckoId: "convex-finance",
  },
  {
    symbol: "sdPENDLE-gauge",
    name: "staked sdPENDLE",
    address: "0x50dc9ae51f78c593d4138263da7088a973b8184e",
    ecosystem: "Stake DAO · Pendle",
    space: "sdpendle.eth",
    coingeckoId: "stake-dao-pendle",
  },
  {
    symbol: "sdPENDLE",
    name: "sdPENDLE (unstaked)",
    address: "0x5ea630e00d6ee438d3dea1556a110359acdc10a9",
    ecosystem: "Stake DAO · Pendle",
    space: null,
    coingeckoId: "stake-dao-pendle",
  },
  {
    symbol: "LQTY",
    name: "Liquity governance token",
    address: "0x6dea81c8171d0ba574754ef6f8b412f2ed88c54d",
    ecosystem: "Liquity v2",
    space: "liquity.eth",
    coingeckoId: "liquity",
  },
];

// Fallback chain of public Ethereum RPCs — tried in order.
const RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://cloudflare-eth.com",
];

// Fallback if /api/treasury is unreachable (no key configured).
const FALLBACK_BUYS = [
  { date: "2025-10-13", amount: 7503.09,  label: { name: "CoW Swap / Treasury" }, cumulative: 7503.09 },
  { date: "2026-01-13", amount: 16898.69, label: { name: "CoW Swap / Treasury" }, cumulative: 24401.78 },
  { date: "2026-03-16", amount: 5890.11,  label: { name: "CoW Swap / Treasury" }, cumulative: 30291.89 },
  { date: "2026-03-19", amount: 13588.76, label: { name: "CoW Swap / Treasury" }, cumulative: 43880.65 },
];

const $  = (id) => document.getElementById(id);
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];

// ---- theme ----
const THEME_KEY = "asym-theme";
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(THEME_KEY, t); } catch {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "dark" ? "#05070F" : "#F5EEE3");
}
function initTheme() {
  const urlTheme = new URLSearchParams(location.search).get("theme");
  if (urlTheme === "light" || urlTheme === "dark") { applyTheme(urlTheme); return; }
  let stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch {}
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (prefersDark ? "dark" : "light"));
}
initTheme();
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const fmt    = (n, d = 2) => n == null || isNaN(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtUsd = (n, d = 0) => n == null || isNaN(n) ? "—" : "$" + n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
const short = (n) => {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000)     return "$" + (n / 1_000).toFixed(1)     + "K";
  return fmtUsd(n);
};
const shortTok = (n) => {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000)     return (n / 1_000).toFixed(1)     + "K";
  return n.toFixed(2);
};

async function rpc(method, params) {
  let lastErr;
  for (const endpoint of RPCS) {
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!r.ok) throw new Error(`${endpoint} ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(`${endpoint}: ${j.error.message}`);
      return j.result;
    } catch (e) {
      lastErr = e;
      console.warn("rpc failed, trying next", e.message);
    }
  }
  throw lastErr || new Error("all RPCs failed");
}
const encBalanceOf = (addr) => "0x70a08231" + "0".repeat(24) + addr.toLowerCase().replace(/^0x/, "");
async function erc20Balance(token, holder) {
  const data = await rpc("eth_call", [{ to: token, data: encBalanceOf(holder) }, "latest"]);
  if (!data || data === "0x") return 0n;
  return BigInt(data);
}

// Fetch USD prices for all unique coingecko IDs across the voting-token config,
// plus CVX (for the headline hero). One batched call.
async function getPrices() {
  const ids = [...new Set(["convex-finance", ...VOTING_TOKENS.map(t => t.coingeckoId).filter(Boolean)])];
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`);
    const j = await r.json();
    return j || {};
  } catch {
    return {};
  }
}

// ---- animated counter ----
function animateTo(el, target, opts = {}) {
  const decimals = opts.decimals ?? 0;
  const prefix = opts.prefix ?? "";
  const suffix = opts.suffix ?? "";
  const duration = opts.duration ?? 900;
  if (target == null || isNaN(target)) { el.textContent = "—"; return; }
  const from = parseFloat(el.dataset.count || "0") || 0;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const v = from + (target - from) * ease(t);
    el.textContent = prefix + v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix;
    if (t < 1) requestAnimationFrame(step);
    else el.dataset.count = String(target);
  }
  requestAnimationFrame(step);
}

// ---- chart ----
let currentRange = "all";
let currentLocks = [];
function filterSeries(buys, range) {
  const sorted = [...buys].sort((a, b) => a.date.localeCompare(b.date));
  if (range === "all") return sorted;
  const now = Date.now();
  const cutoff = new Date(now - (range === "6m" ? 180 : 90) * 86400000);
  const cs = cutoff.toISOString().slice(0, 10);
  return sorted.filter(b => b.date >= cs);
}

function drawChart(canvas, series) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);

  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  if (series.length === 0) { drawEmpty(ctx, w, h); return; }

  const pad = { l: 62, r: 24, t: 24, b: 38 };
  const xs = series.map(p => new Date(p.date).getTime());
  const ys = series.map(p => p.cumulative);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = 0, yMax = Math.max(...ys) * 1.12;

  const X = (x) => pad.l + (w - pad.l - pad.r) * ((x - xMin) / Math.max(1, xMax - xMin));
  const Y = (y) => h - pad.b - (h - pad.t - pad.b) * ((y - yMin) / Math.max(1, yMax - yMin));

  // y grid + labels
  ctx.strokeStyle = cssVar("--chart-grid") || "rgba(14,20,36,0.06)";
  ctx.lineWidth = 1;
  ctx.fillStyle = cssVar("--chart-label") || "#6A7289";
  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const gy = pad.t + (h - pad.t - pad.b) * (i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.l, gy);
    ctx.lineTo(w - pad.r, gy);
    ctx.stroke();
    const v = yMax - (yMax - yMin) * (i / 4);
    const label = v >= 1000 ? (v/1000).toFixed(1) + "k" : Math.round(v).toLocaleString();
    ctx.fillText(label, 10, gy);
  }

  // area
  const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  grad.addColorStop(0, cssVar("--chart-area-a") || "rgba(45,91,255,0.28)");
  grad.addColorStop(0.6, cssVar("--chart-area-b") || "rgba(255,196,161,0.18)");
  grad.addColorStop(1, "rgba(45,91,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(X(xs[0]), Y(0));
  for (let i = 0; i < series.length; i++) ctx.lineTo(X(xs[i]), Y(ys[i]));
  ctx.lineTo(X(xs[xs.length - 1]), Y(0));
  ctx.closePath();
  ctx.fill();

  // line
  const lineGrad = ctx.createLinearGradient(pad.l, 0, w - pad.r, 0);
  lineGrad.addColorStop(0, cssVar("--chart-line-a") || "#1E44D0");
  lineGrad.addColorStop(0.6, cssVar("--chart-line-b") || "#2D5BFF");
  lineGrad.addColorStop(1, cssVar("--chart-line-c") || "#E67B3E");
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < series.length; i++) {
    const x = X(xs[i]), y = Y(ys[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // points
  const halo = cssVar("--chart-point-halo") || "rgba(45,91,255,0.15)";
  const pointFill = cssVar("--chart-point-fill") || "#2D5BFF";
  const pointCenter = cssVar("--paper") || "#fff";
  for (let i = 0; i < series.length; i++) {
    const x = X(xs[i]), y = Y(ys[i]);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = pointFill;
    ctx.fill();
  }

  // last-point emphasis
  const lx = X(xs[xs.length - 1]), ly = Y(ys[ys.length - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = pointCenter;
  ctx.fill();
  ctx.strokeStyle = pointFill;
  ctx.lineWidth = 2;
  ctx.stroke();

  // x labels
  ctx.fillStyle = cssVar("--chart-label") || "#6A7289";
  ctx.textBaseline = "alphabetic";
  const fmtDate = (d) => {
    const [y, m] = d.split("-");
    return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1]} ${y.slice(2)}`;
  };
  const xLabels = series.length <= 2 ? [0, series.length - 1] : [0, Math.floor(series.length / 2), series.length - 1];
  for (const i of xLabels) {
    const label = fmtDate(series[i].date);
    const tx = X(xs[i]);
    ctx.fillText(label, Math.max(pad.l, Math.min(w - pad.r - 50, tx - 20)), h - 14);
  }
}
function drawEmpty(ctx, w, h) {
  ctx.fillStyle = cssVar("--chart-label") || "#6A7289";
  ctx.font = "13px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("No data in this range", w / 2, h / 2);
}

// ---- rendering ----
function renderBuyList(locks) {
  const ul = $("buylist");
  ul.innerHTML = "";
  const items = [...locks].sort((a, b) => b.date.localeCompare(a.date));
  for (const b of items) {
    const li = document.createElement("li");
    const source = b.label ? b.label.name : "Treasury";
    const tx = b.hash ? ` · <a class="mono" href="https://etherscan.io/tx/${b.hash}" target="_blank" rel="noopener">↗</a>` : "";
    li.innerHTML = `
      <span class="date mono">${b.date}</span>
      <span class="title">${source}${tx}</span>
      <span class="amt">+${fmt(b.amount, 2)} vlCVX</span>`;
    ul.appendChild(li);
  }
  if (items.length === 0) {
    ul.innerHTML = `<li class="muted">No lock events found yet.</li>`;
  }
}

function renderAllocations(items) {
  const ul = $("allocations");
  if (!items || items.length === 0) {
    ul.innerHTML = `<li class="muted">No bribe deposits to Votium Platform detected yet.</li>`;
    return;
  }
  ul.innerHTML = "";
  for (const c of items.slice(0, 15)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="dir out">BRIBE</span>
      <span class="sym">${shortTok(c.amount)} ${c.symbol}</span>
      <span class="spacer"></span>
      <span class="tstamp">${c.date} · ${c.label.name}</span>
      <a href="https://etherscan.io/tx/${c.hash}" target="_blank" rel="noopener">↗</a>`;
    ul.appendChild(li);
  }
}

function renderRevenue(items) {
  const ul = $("revenue");
  if (!items || items.length === 0) {
    ul.innerHTML = `<li class="muted">No inbound transfers found.</li>`;
    return;
  }
  ul.innerHTML = "";
  for (const r of items.slice(0, 15)) {
    const li = document.createElement("li");
    const hint = r.looksVoting ? ` · <span class="tag tag-vote">voting-ish</span>` : "";
    const kind = r.label.kind && r.label.kind !== "unknown" ? ` · <span class="muted small">${r.label.kind}</span>` : "";
    li.innerHTML = `
      <span class="dir in">IN</span>
      <span class="sym">${shortTok(r.amount)} ${r.symbol}</span>
      <span class="spacer"></span>
      <span class="tstamp">${r.date} · ${r.label.name}${kind}${hint}</span>
      <a href="https://etherscan.io/tx/${r.hash}" target="_blank" rel="noopener">↗</a>`;
    ul.appendChild(li);
  }
}

function renderRevShare(items, bySymbol) {
  const ul = $("revshare");
  const totalEl = $("revshareTotal");
  if (!items || items.length === 0) {
    if (ul) ul.innerHTML = `<li class="muted">No rev-share inflows detected yet.</li>`;
    if (totalEl) totalEl.textContent = "—";
    return;
  }
  // Headline: biggest symbol by volume
  if (totalEl && bySymbol) {
    const pairs = Object.entries(bySymbol).sort((a, b) => b[1] - a[1]);
    if (pairs.length) {
      const [sym, amt] = pairs[0];
      totalEl.textContent = `${shortTok(amt)} ${sym}`;
    }
  }
  if (!ul) return;
  ul.innerHTML = "";
  for (const r of items.slice(0, 10)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="dir rev">REV</span>
      <span class="sym">${shortTok(r.amount)} ${r.symbol}</span>
      <span class="spacer"></span>
      <span class="tstamp">${r.date} · ${r.label.name}</span>
      <a href="https://etherscan.io/tx/${r.hash}" target="_blank" rel="noopener">↗</a>`;
    ul.appendChild(li);
  }
}

function renderLastPurchase(locks) {
  if (!locks || locks.length === 0) {
    $("lastBuyAgo").textContent = "—";
    $("lastBuyAmt").textContent = "—";
    $("lastBuyDate").textContent = "";
    return;
  }
  const last = [...locks].sort((a, b) => b.ts - a.ts)[0];
  const days = Math.max(0, Math.floor((Date.now() / 1000 - last.ts) / 86400));
  $("lastBuyAgo").textContent = days === 0 ? "today" : `${days}d ago`;
  $("lastBuyAmt").textContent = `+${fmt(last.amount, 2)} vlCVX`;
  $("lastBuyDate").textContent = `on ${last.date}`;
}

function renderOutflows(items) {
  const ul = $("txs");
  if (!items || items.length === 0) {
    ul.innerHTML = `<li class="muted">No outbound transfers found.</li>`;
    return;
  }
  ul.innerHTML = "";
  for (const r of items.slice(0, 15)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="dir out">OUT</span>
      <span class="sym">${shortTok(r.amount)} ${r.symbol}</span>
      <span class="spacer"></span>
      <span class="tstamp">${r.date} · ${r.label.name}</span>
      <a href="https://etherscan.io/tx/${r.hash}" target="_blank" rel="noopener">↗</a>`;
    ul.appendChild(li);
  }
}

// ---- voting power ----
// Renders every configured voting position — held entries first with live
// balance + USD value, then dormant entries in a muted "watching" state so
// the panel advertises what we're tracking even when the treasury hasn't
// taken the position yet. Dormant cards annotate with historical activity
// ("held Oct 2025 → Jan 2026 · peak 6,080") when available.
function renderVotingPower(items, history = {}) {
  const ul = $("votingPower");
  if (!ul) return;
  if (!items || items.length === 0) {
    ul.innerHTML = `<li class="muted">No voting tokens configured.</li>`;
    return;
  }
  const held    = items.filter(x => x.balance != null && x.balance > 0.0001);
  const dormant = items.filter(x => !(x.balance != null && x.balance > 0.0001));
  const sorted = [...held.sort((a, b) => (b.usd || 0) - (a.usd || 0)), ...dormant];

  ul.innerHTML = "";
  for (const p of sorted) {
    const isHeld = p.balance != null && p.balance > 0.0001;
    const h = history[(p.address || "").toLowerCase()];
    const li = document.createElement("li");
    li.className = "vp-item" + (isHeld ? "" : " vp-dormant");
    const usd = isHeld && p.usd != null ? `<span class="vp-usd">${short(p.usd)}</span>` : "";
    const spaceBadge = p.space
      ? `<a class="vp-space" href="https://snapshot.org/#/${p.space}" target="_blank" rel="noopener">${p.space}</a>`
      : "";
    let statusBadge;
    if (isHeld) {
      statusBadge = `<span class="vp-status held">held</span>`;
    } else if (h) {
      statusBadge = `<span class="vp-status unwound">unwound</span>`;
    } else {
      statusBadge = `<span class="vp-status watching">watching</span>`;
    }
    const amtText = isHeld ? fmt(p.balance, 2) : "—";
    const historyLine = !isHeld && h
      ? `<div class="vp-history">held ${fmtMonth(h.firstHeld)} → ${fmtMonth(h.lastHeld)} · peak ${shortTok(h.peak)}</div>`
      : "";
    li.innerHTML = `
      <div class="vp-head">
        <span class="vp-sym">${p.symbol}</span>
        <span class="vp-eco">${p.ecosystem}</span>
      </div>
      <div class="vp-bal">
        <span class="vp-amt">${amtText}</span>
        ${usd}
      </div>
      ${historyLine}
      <div class="vp-meta">${spaceBadge}${statusBadge}</div>
    `;
    ul.appendChild(li);
  }
}

// "2025-10-13" → "Oct 2025"
function fmtMonth(dateStr) {
  if (!dateStr) return "—";
  const [y, m] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

async function loadTreasury() {
  try {
    const r = await fetch("/api/treasury");
    if (!r.ok) {
      if (r.status === 501) {
        setKeyMissingState();
        return null;
      }
      throw new Error("treasury " + r.status);
    }
    return await r.json();
  } catch (e) {
    console.warn("treasury fetch failed", e);
    setKeyMissingState();
    return null;
  }
}

function setKeyMissingState() {
  const msg = `<li class="muted">Add <code>ETHERSCAN_API_KEY</code> to <code>.dev.vars</code> and restart <code>npm run dev</code> to populate this panel with live on-chain data.</li>`;
  for (const id of ["allocations", "revenue", "revshare", "txs"]) {
    const el = $(id);
    if (el) el.innerHTML = msg;
  }
  // Use fallback buys for the chart
  currentLocks = FALLBACK_BUYS;
  renderBuyList(FALLBACK_BUYS);
  drawChart($("polChart"), filterSeries(FALLBACK_BUYS, currentRange));
}

async function loadVotes() {
  const ul = $("votes");
  try {
    const r = await fetch(`/api/votes?address=${TREASURY}`);
    if (!r.ok) throw new Error();
    const j = await r.json();
    const items = (j.votes || []).slice(0, 10);
    ul.innerHTML = "";
    if (items.length === 0) {
      ul.innerHTML = `<li class="muted">No direct Snapshot votes found for this wallet yet. Convex voting flows via Votium (see Allocations).</li>`;
      return;
    }
    for (const v of items) {
      const li = document.createElement("li");
      li.className = "vote-item";
      const top = (v.allocations || []).slice(0, 4);
      const rest = Math.max(0, (v.gaugeCount || 0) - top.length);
      const gaugesHtml = top.length
        ? `<ul class="gauges">${top.map(a => `
            <li>
              <span class="g-bar" style="--pct:${a.pct.toFixed(2)}%"></span>
              <span class="g-name">${escapeHtml(a.gauge)}</span>
              <span class="g-pct mono">${a.pct.toFixed(1)}%</span>
            </li>`).join("")}
           </ul>`
        : `<span class="muted small">Choice data unavailable for this proposal.</span>`;
      const moreTxt = rest > 0 ? `<span class="muted small"> · +${rest} more</span>` : "";
      const titleShort = (v.title || "").replace(/^\[[^\]]+\]\s*/, "").slice(0, 70);
      li.innerHTML = `
        <div class="vote-head">
          <span class="dir in">${v.space.split(".")[0]}</span>
          <span class="vote-title">${escapeHtml(titleShort)}</span>
          <span class="spacer"></span>
          <span class="tstamp">${v.date}${moreTxt}</span>
          ${v.proposalId ? `<a href="https://snapshot.org/#/${v.space}/proposal/${v.proposalId}" target="_blank" rel="noopener">↗</a>` : ""}
        </div>
        ${gaugesHtml}`;
      ul.appendChild(li);
    }
  } catch {
    ul.innerHTML = `<li class="muted">Snapshot indexer unreachable. Votes will appear once it responds.</li>`;
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadVotingPower(prices, history = {}) {
  const results = await Promise.all(
    VOTING_TOKENS.map(async (t) => {
      try {
        const raw = await erc20Balance(t.address, TREASURY);
        const balance = Number(raw) / 1e18;
        const usdPrice = prices?.[t.coingeckoId]?.usd;
        const usd = usdPrice != null ? balance * usdPrice : null;
        return { ...t, balance, usd };
      } catch (e) {
        console.warn("voting balance failed for", t.symbol, e);
        return { ...t, balance: null, usd: null };
      }
    })
  );
  renderVotingPower(results, history);
  return results;
}

// ---- range tabs ----
function wireRangeTabs() {
  for (const btn of $$(".seg")) {
    btn.addEventListener("click", () => {
      $$(".seg").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      currentRange = btn.dataset.range;
      drawChart($("polChart"), filterSeries(currentLocks, currentRange));
    });
  }
}

// ---- theme toggle ----
function wireThemeToggle() {
  const btn = $("themeToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const now = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(now);
    // redraw chart in new colors
    drawChart($("polChart"), filterSeries(currentLocks, currentRange));
  });
}

// ---- main ----
async function main() {
  wireRangeTabs();
  wireThemeToggle();

  // Kick off on-chain reads and the aggregator in parallel.
  const [cvxRaw, prices, treasury] = await Promise.all([
    erc20Balance(CVX_TOKEN, TREASURY).catch(() => null),
    getPrices(),
    loadTreasury(),
  ]);

  // Voting power loads its own balances (includes vlCVX) and uses treasury
  // history (from /api/treasury) to annotate dormant cards.
  const vp = await loadVotingPower(prices, treasury?.votingTokenHistory || {});
  const vlcvxEntry = vp.find(p => p.symbol === "vlCVX");
  const vlcvx = vlcvxEntry?.balance ?? null;
  const cvx   = cvxRaw == null ? null : Number(cvxRaw) / 1e18;

  const cvxPrice = prices["convex-finance"]?.usd ?? null;
  const cvxChange = prices["convex-finance"]?.usd_24h_change ?? null;

  if (vlcvx != null) animateTo($("vlcvx"), vlcvx, { decimals: 2 });

  if (cvxPrice != null) animateTo($("cvxPrice"), cvxPrice, { decimals: 2, prefix: "$" });
  if (cvxChange != null) {
    const good = cvxChange >= 0;
    const chip = $("cvxChange");
    chip.textContent = (good ? "▲ " : "▼ ") + Math.abs(cvxChange).toFixed(2) + "% · 24h";
    chip.classList.toggle("good", good);
    chip.classList.toggle("bad", !good);
  }

  if (vlcvx != null && cvxPrice != null) $("vlcvxUsd").textContent = short(vlcvx * cvxPrice);

  // Treasury Value = sum of all tracked voting positions (USD) + unlocked CVX.
  const votingUsd = vp.reduce((s, p) => s + (p.usd || 0), 0);
  const cvxUsd = cvx != null && cvxPrice != null ? cvx * cvxPrice : 0;
  const total = votingUsd + cvxUsd;
  if (total > 0) animateTo($("tvl"), total, { decimals: 0, prefix: "$" });

  // Navy announcement bar
  if (vlcvx != null) {
    $("announceVlcvx").textContent = `Live vlCVX War Chest: ${fmt(vlcvx, 2)}`;
  }
  if (total > 0) {
    $("announceTvl").textContent = short(total);
  }

  if (treasury) {
    currentLocks = treasury.locks || [];
    renderBuyList(currentLocks);
    drawChart($("polChart"), filterSeries(currentLocks, currentRange));
    renderAllocations(treasury.bribesPaid);
    renderRevenue(treasury.revenue);
    renderRevShare(treasury.revShare, treasury.summary?.revShareBySymbol);
    renderOutflows(treasury.outflows);
    renderLastPurchase(currentLocks);
  }

  $("updated").textContent = "updated " + new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  loadVotes();
}

window.addEventListener("DOMContentLoaded", main);
window.addEventListener("resize", () => drawChart($("polChart"), filterSeries(currentLocks, currentRange)));
