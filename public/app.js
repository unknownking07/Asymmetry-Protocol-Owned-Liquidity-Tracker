// Asymmetry POL Tracker — unofficial. Static client-side script.

const TREASURY = "0xce352181c0f0350f1687e1a44c45bc9d96ee738b";
const CVX_LOCKER_V2 = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const CVX_TOKEN = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";

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

async function getCvxPrice() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=convex-finance&vs_currencies=usd&include_24hr_change=true");
    const j = await r.json();
    return { usd: j["convex-finance"].usd, change: j["convex-finance"].usd_24h_change };
  } catch {
    return { usd: null, change: null };
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
  ctx.strokeStyle = "rgba(14,20,36,0.06)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6A7289";
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
  grad.addColorStop(0, "rgba(45,91,255,0.28)");
  grad.addColorStop(0.6, "rgba(255,196,161,0.18)");
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
  lineGrad.addColorStop(0, "#1E44D0");
  lineGrad.addColorStop(0.6, "#2D5BFF");
  lineGrad.addColorStop(1, "#FFB894");
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
  for (let i = 0; i < series.length; i++) {
    const x = X(xs[i]), y = Y(ys[i]);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(45,91,255,0.15)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = "#2D5BFF";
    ctx.fill();
  }

  // last-point emphasis
  const lx = X(xs[xs.length - 1]), ly = Y(ys[ys.length - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#2D5BFF";
  ctx.lineWidth = 2;
  ctx.stroke();

  // x labels
  ctx.fillStyle = "#6A7289";
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
  ctx.fillStyle = "#6A7289";
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
    const kind = r.label.kind ? ` · <span class="muted small">${r.label.kind}</span>` : "";
    li.innerHTML = `
      <span class="dir in">IN</span>
      <span class="sym">${shortTok(r.amount)} ${r.symbol}</span>
      <span class="spacer"></span>
      <span class="tstamp">${r.date} · ${r.label.name}${kind}</span>
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
  for (const id of ["allocations", "revenue", "txs"]) {
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
    if (items.length === 0) { ul.innerHTML = `<li class="muted">No Snapshot votes found for this wallet on <span class="mono">cvx.eth</span>.</li>`; return; }
    for (const v of items) {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="dir in">R${v.round}</span>
        <span class="sym">${v.choice}</span>
        <span class="spacer"></span>
        <span class="tstamp">${v.date}</span>
        ${v.proposalId ? `<a href="https://snapshot.org/#/cvx.eth/proposal/${v.proposalId}" target="_blank" rel="noopener">↗</a>` : ""}`;
      ul.appendChild(li);
    }
  } catch {
    ul.innerHTML = `<li class="muted">Snapshot indexer unreachable. Votes will appear once cvx.eth responds.</li>`;
  }
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

// ---- main ----
async function main() {
  wireRangeTabs();

  // Kick off on-chain reads and the aggregator in parallel.
  const [vlcvxRaw, cvxRaw, price, treasury] = await Promise.all([
    erc20Balance(CVX_LOCKER_V2, TREASURY).catch(() => null),
    erc20Balance(CVX_TOKEN, TREASURY).catch(() => null),
    getCvxPrice(),
    loadTreasury(),
  ]);

  const vlcvx = vlcvxRaw == null ? null : Number(vlcvxRaw) / 1e18;
  const cvx   = cvxRaw   == null ? null : Number(cvxRaw) / 1e18;

  if (vlcvx != null) animateTo($("vlcvx"), vlcvx, { decimals: 2 });

  if (price.usd != null) animateTo($("cvxPrice"), price.usd, { decimals: 2, prefix: "$" });
  if (price.change != null) {
    const good = price.change >= 0;
    const chip = $("cvxChange");
    chip.textContent = (good ? "▲ " : "▼ ") + Math.abs(price.change).toFixed(2) + "% · 24h";
    chip.classList.toggle("good", good);
    chip.classList.toggle("bad", !good);
  }

  if (vlcvx != null && price.usd != null) $("vlcvxUsd").textContent = short(vlcvx * price.usd);
  if (vlcvx != null && cvx != null && price.usd != null) {
    animateTo($("tvl"), (vlcvx + cvx) * price.usd, { decimals: 0, prefix: "$" });
  }

  // Navy announcement bar
  if (vlcvx != null) {
    $("announceVlcvx").textContent = `Live vlCVX War Chest: ${fmt(vlcvx, 2)}`;
  }
  if (vlcvx != null && cvx != null && price.usd != null) {
    $("announceTvl").textContent = short((vlcvx + cvx) * price.usd);
  }

  if (treasury) {
    currentLocks = treasury.locks || [];
    renderBuyList(currentLocks);
    drawChart($("polChart"), filterSeries(currentLocks, currentRange));
    renderAllocations(treasury.bribesPaid);
    renderRevenue(treasury.revenue);
    renderOutflows(treasury.outflows);
    renderLastPurchase(currentLocks);
  }

  $("updated").textContent = "updated " + new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  loadVotes();
}

window.addEventListener("DOMContentLoaded", main);
window.addEventListener("resize", () => drawChart($("polChart"), filterSeries(currentLocks, currentRange)));
