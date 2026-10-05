/* COVE harbor client: polls the shared harbor from /api, draws the scene and sends players' actions. */
(() => {
'use strict';
const { rr, mix, SPEC, BLACKFLAG, drawShip, drawMini, drawFace } = window.CoveSprites;

const W = 384, H = 216, SURF = 120;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const MINUS = '−';
let skew = 0;
const now = () => Date.now() + skew;
const sol = v => { const a = Math.abs(v); return a >= 10 ? a.toFixed(2) : a >= 1 ? a.toFixed(3) : a.toFixed(4); };
const sgn = v => (v > 0 ? '+' : v < 0 ? MINUS : '') + sol(v);
const pct = v => (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toFixed(1) + '%';
const usd = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'k' : '$' + v.toFixed(0);
const price = p => '$' + (p < 1e-6 ? p.toExponential(2) : p < 0.001 ? p.toFixed(7) : p < 0.01 ? p.toFixed(5) : p < 1 ? p.toFixed(4) : p.toFixed(2));
const ago = t => { const s = Math.max(0, Math.round((now() - t) / 1000)); if (s < 5) return 'now'; if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm'; const h = Math.floor(m / 60); if (h < 24) return h + 'h'; return Math.floor(h / 24) + 'd'; };
const ageShort = h => h < 1 ? Math.max(1, Math.round(h * 60)) + 'm' : h < 48 ? h.toFixed(1) + 'h' : Math.round(h / 24) + 'd';
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };

/* ---------------- rules shown in the UI ---------------- */
const STRATS = { privateer: { name: 'Privateer' }, smuggler: { name: 'Smuggler' }, merchant: { name: 'Merchant' }, explorer: { name: 'Explorer' }, parrot: { name: 'Parrot' }, custom: { name: 'Custom' } };
const JOBS = { cannoneer: 'Cannoneer', quartermaster: 'Quartermaster', cartographer: 'Cartographer' };
const RANKS = [{ name: 'Raft', min: 0 }, { name: 'Sloop', min: 0.1 }, { name: 'Brig', min: 0.5 }, { name: 'Frigate', min: 2 }, { name: 'Galleon', min: 10 }];
const WNAME = { calm: 'Fair winds', breeze: 'Choppy', storm: 'Storm', kraken: 'Kraken' };
const BERTHS = 24;

/* ---------------- the player ---------------- */
function storageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: the key lives for this tab only */ } }
let playerKey = storageGet('cove.key');
if (!playerKey || !/^[a-f0-9]{32,64}$/.test(playerKey)) {
  playerKey = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  storageSet('cove.key', playerKey);
}

/* ---------------- shared state from the server ---------------- */
let S = null;
const caps = [];
let events = [], tavern = [], wrecks = [], mutiny = null, mutinyHistory = [], FLEETS = [];
let pot = 0, locker = 0, flagChest = 0, nextBurn = 0, tokens = {}, board = [];
let forced = 'auto';
const byId = id => caps.find(c => c.id === id) || null;
const weather = () => forced === 'auto' ? (S ? S.weather : 'breeze') : forced;
const boardIndex = () => S ? S.index : 0;
const pnlPct = p => { const t = tokens[p.id]; return t ? (t.price / p.entry - 1) * 100 : 0; };
const equity = c => c.cash + c.pos.reduce((s, p) => { const t = tokens[p.id]; return s + (t ? p.size * t.price / p.entry : p.size); }, 0);
const ddPct = c => (equity(c) / c.deposit - 1) * 100;
const renown = c => c.hist + c.realized + c.burned;
const rankOf = c => c.maxRank || 0;
const alive = () => caps.filter(c => c.state !== 'sinking');

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: Object.assign({ 'x-cove-key': playerKey }, body ? { 'content-type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({ error: 'The harbor sent a broken reply.' }));
  if (!res.ok) throw new Error(data.error || `The harbor answered ${res.status}.`);
  return data;
}

let firstSync = true, lastTopEvent = null;
function sync(state) {
  S = state;
  skew = state.now - Date.now();
  pot = state.pot; locker = state.locker; flagChest = state.flagChest; nextBurn = state.nextBurn;
  tokens = state.tokens || {}; board = state.board || [];
  FLEETS = state.fleets || [];
  const seen = new Set();
  for (const sc of state.captains) {
    seen.add(sc.id);
    let c = byId(sc.id);
    if (!c) {
      c = { x: firstSync ? null : -24, ax: 0, row: 1, dir: 1, phase: Math.random() * 6.28, docked: true, moving: false, bb: null, sinkY: 0 };
      caps.push(c);
    }
    Object.assign(c, sc);
  }
  for (let i = caps.length - 1; i >= 0; i--) if (!seen.has(caps[i].id)) {
    const gone = caps[i];
    caps.splice(i, 1);
    if (selected === gone) closeCard();
    if (spotCap === gone) spotCap = null;
  }
  events = state.events.map(e => Object.assign(e, { cap: e.cap ? byId(e.cap) : null }));
  tavern = state.tavern.map(t => ({ ...t, a: byId(t.a), b: byId(t.b) })).filter(t => t.a && t.b);
  wrecks = state.wrecks || [];
  mutinyHistory = state.mutinyHistory || [];
  mutiny = state.mutiny ? { ...state.mutiny, cap: byId(state.mutiny.cap) } : null;
  if (mutiny && !mutiny.cap) mutiny = null;
  layout();
  if (firstSync) { caps.forEach(c => { c.x = c.ax; }); firstSync = false; }
  if (events[0] && events[0].id !== lastTopEvent) {
    if (lastTopEvent && events.slice(0, 5).some(e => e.kind === 'burn')) burnPulse = 1.6;
    lastTopEvent = events[0].id;
  }
  if (tavern[0] && tavern[0].id !== lastTavern) { if (lastTavern) tavernBubble = 3; lastTavern = tavern[0].id; }
  if (!spotCap) spotCap = alive().find(c => !c.docked) || caps[0] || null;
  renderAll();
}
let lastTavern = null;

/* ---------------- ship layout ---------------- */
function layout() {
  const docked = [], sea = [];
  for (const c of alive()) { c.docked = c.paused || c.pos.length === 0; (c.docked ? docked : sea).push(c); }
  let px = 74, back = false;
  for (const c of docked) {
    const w = SPEC[rankOf(c)].w;
    if (px + w > 176 && !back) { back = true; px = 74; }
    c.ax = px + w / 2; c.row = back ? 0 : 1; px += w + 5;
  }
  const a = 186, b = 318;
  sea.forEach((c, i) => { c.ax = a + (i + 0.5) * (b - a) / sea.length; c.row = i % 2; });
  for (const c of caps) if (c.x == null) c.x = c.ax;
}
let burnPulse = 0, tavernBubble = 0;

/* ---------------- canvas scene ---------------- */
const cv = $('#sea'), dc = cv.getContext('2d');
const off = document.createElement('canvas'); off.width = W; off.height = H;
const g = off.getContext('2d');
let K = 1;
function fit() {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(W, Math.round((r.width || W) * dpr));
  if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * H / W); }
  K = cv.width / W;
}
if ('ResizeObserver' in window) new ResizeObserver(fit).observe(cv); else addEventListener('resize', fit);
fit();
const R = (x, y, w, h, col) => rr(g, x, y, w, h, col);

const PAL = {
  calm: { top: '#060f24', hor: '#1d3b6e', water: '#16496f', waterHi: '#2a6a93', deep: '#030c18', foam: '#9ad6f0', star: '#e8efff', starDim: '#4c5c80', moon: '#f1e8c8', moonShade: '#d6caa2', isle: '#10244a', cloud: '#16284a', cloudLo: '#1b3157', rock: '#1d2632', rockHi: '#34444a', rockDeep: '#111823', grass: '#2c4a36' },
  breeze: { top: '#091327', hor: '#2a4466', water: '#153f5e', waterHi: '#2d6283', deep: '#040d18', foam: '#bde0ee', star: '#d6e0f4', starDim: '#46557a', moon: '#e9dfc0', moonShade: '#cfc39c', isle: '#16294a', cloud: '#22324f', cloudLo: '#2a3b5a', rock: '#1d2632', rockHi: '#34444a', rockDeep: '#111823', grass: '#2a4634' },
  storm: { top: '#0b0e13', hor: '#36404e', water: '#1a3441', waterHi: '#2f5363', deep: '#050a0f', foam: '#d6e2e6', star: '#000000', starDim: '#000000', moon: '#000000', moonShade: '#000000', isle: '#1e252e', cloud: '#1d232c', cloudLo: '#262d37', rock: '#1c2229', rockHi: '#2c353b', rockDeep: '#10151b', grass: '#26392e' },
  kraken: { top: '#10071a', hor: '#4d2048', water: '#29204a', waterHi: '#47366d', deep: '#06030d', foam: '#cfaee6', star: '#f2c9dc', starDim: '#5b3152', moon: '#e05a5a', moonShade: '#b34444', isle: '#2b1331', cloud: '#24122c', cloudLo: '#2e1838', rock: '#1f1a2a', rockHi: '#3a2d44', rockDeep: '#120e19', grass: '#2e3b36' },
};
const bandCache = {};
function bands(w) {
  if (bandCache[w]) return bandCache[w];
  const P = PAL[w], sky = [], water = [];
  const n = Math.ceil((SURF + 6) / 4);
  for (let i = 0; i < n; i++) sky.push(mix(P.top, P.hor, Math.pow(i / (n - 1), 1.5)));
  for (let y = SURF; y < H; y += 3) water.push(mix(P.water, P.deep, Math.pow((y - SURF) / (H - SURF), 0.8)));
  return (bandCache[w] = { sky, water });
}
const waterAt = (w, y) => { const b = bands(w).water; return b[clamp(Math.floor((y - SURF) / 3), 0, b.length - 1)]; };
const AMP = { calm: 0.7, breeze: 1.3, storm: 2.4, kraken: 2.8 };
let curW = 'breeze', T = 0;
const surfY = x => { const A = AMP[curW]; return SURF + Math.round(A * Math.sin(x * 0.09 + T * 1.6) + A * 0.5 * Math.sin(x * 0.23 - T * 2.3)); };
const seabedY = x => 200 + Math.round(2 * Math.sin(x * 0.07) + 1.5 * Math.sin(x * 0.19 + 1));

const stars = Array.from({ length: 80 }, (_, i) => ({ x: Math.floor(Math.random() * W), y: Math.floor(Math.random() * 96), ph: Math.random() * 6.28, sp: rnd(0.8, 2.6), i }));
const weeds = [100, 108, 141, 152, 178, 189, 226, 237, 250, 284, 292, 316].map(x => ({ x, h: Math.round(rnd(6, 15)), ph: Math.random() * 6 }));
const fish = Array.from({ length: 7 }, () => ({ x: rnd(100, 320), y: Math.round(rnd(136, 186)), d: Math.random() < 0.5 ? -1 : 1, sp: rnd(3, 8), col: pick(['#e7b75a', '#7fb6ff', '#ff8a5b', '#9fe0c8']) }));
const clouds = Array.from({ length: 10 }, () => ({ x: rnd(0, W), y: Math.round(rnd(6, 46)), w: Math.round(rnd(30, 80)), sp: rnd(1.5, 4) }));
const rain = Array.from({ length: 150 }, () => ({ x: rnd(0, W), y: rnd(0, SURF), sp: rnd(90, 140) }));
const bubbles = [];
let flash = 0, bolt = null, krakenRise = 0;
const hits = [];

const bed = document.createElement('canvas'); bed.width = W; bed.height = H;
(() => { const b = bed.getContext('2d'); for (let x = 0; x < W; x++) { const y = seabedY(x); rr(b, x, y, 1, H - y, '#2d2a23'); rr(b, x, y, 1, 1, '#4b4535'); if ((x * 13) % 7 === 0) rr(b, x, y + 2 + ((x * 3) % 5), 1, 1, '#3c392f'); if ((x * 17) % 23 === 0) rr(b, x - 1, y - 1, 3, 1, '#3d4a44'); } })();

const LH = { x: 356, base: 104, top: 50 };
function drawBeam() {
  const a = T * 0.7, cs = Math.cos(a), len = Math.round(170 * Math.abs(cs)), dir = cs > 0 ? 1 : -1, ly = LH.top - 6;
  if (len < 6) return;
  for (let d = 0; d < len; d += 2) {
    const half = 1 + d * 0.075;
    g.globalAlpha = Math.min(0.6, 0.2 * (1 - d / len) * Math.abs(cs) + burnPulse * 0.08);
    R(dir > 0 ? LH.x + 6 + d : LH.x - 8 - d, ly - half, 2, half * 2, '#ffe7a6');
  }
  g.globalAlpha = 1;
}
function drawLighthouse(P) {
  for (let y = 100; y < H; y++) {
    const above = y <= SURF + 2;
    const half = above ? 12 + Math.round((y - 100) * 1.0) : 34 + Math.round(Math.sin(y * 0.4) * 1.5);
    R(LH.x - half, y, half * 2, 1, above ? (y < 103 ? P.rockHi : P.rock) : P.rockDeep);
  }
  for (let y = LH.top; y < LH.base; y++) {
    const f = (y - LH.top) / (LH.base - LH.top), half = Math.round(5 + f * 3), stripe = Math.floor((y - LH.top) / 8) % 2 === 0;
    R(LH.x - half, y, half * 2, 1, stripe ? '#e3dccb' : '#b8443a');
    R(LH.x + half - 2, y, 2, 1, stripe ? '#bfb7a5' : '#8e3129');
  }
  R(LH.x - 2, LH.base - 7, 4, 7, '#2a1c14');
  R(LH.x - 8, LH.top - 2, 16, 2, '#2a2f38');
  R(LH.x - 5, LH.top - 9, 10, 7, burnPulse > 0.05 ? '#fff3c4' : '#ffd98a');
  R(LH.x - 5, LH.top - 9, 1, 7, '#2a2f38'); R(LH.x + 4, LH.top - 9, 1, 7, '#2a2f38'); R(LH.x - 1, LH.top - 9, 1, 7, '#2a2f38');
  R(LH.x - 6, LH.top - 11, 12, 2, '#7d2a24'); R(LH.x - 4, LH.top - 13, 8, 2, '#7d2a24'); R(LH.x - 1, LH.top - 15, 2, 2, '#2a2f38');
  hits.push({ x: LH.x - 12, y: LH.top - 15, w: 24, h: LH.base - LH.top + 15, type: 'lighthouse' });
}
function drawShore(P) {
  for (let x = 0; x < 96; x++) {
    const top = x < 50 ? 106 : Math.round(106 + (x - 50) * 0.6);
    const under = Math.max(top, SURF + 3);
    if (under > top) R(x, top, 1, under - top, P.rock);
    R(x, under, 1, H - under, P.rockDeep);
    R(x, top, 1, 1, P.grass);
    if (x % 9 === 0) R(x, top + 3, 1, 1, P.rockHi);
  }
}
function drawTavern() {
  const x = 8, y = 86;
  for (let i = 0; i < 5; i++) { const py = 74 - ((T * 6 + i * 5) % 22); g.globalAlpha = 0.35 * (py - 52) / 22; R(x + 23 + Math.sin(T + i) * 1.5 + (74 - py) * 0.2, py, 2, 2, '#9aa6ba'); }
  g.globalAlpha = 1;
  R(x + 22, y - 12, 3, 6, '#5a5047');
  R(x, y, 30, 20, '#4a3426');
  for (let i = 0; i < 20; i += 3) R(x, y + i, 30, 1, '#3e2b1f');
  for (let i = 0; i < 8; i++) R(x - 2 + i, y - 1 - i, 34 - 2 * i, 1, i % 2 ? '#7a2f2a' : '#6a2824');
  const win = Math.sin(T * 9) > 0.6 ? '#ffd27a' : '#ffc35a';
  R(x + 4, y + 6, 5, 4, win); R(x + 21, y + 6, 5, 4, win); R(x + 6, y + 6, 1, 4, '#4a3426'); R(x + 23, y + 6, 1, 4, '#4a3426');
  R(x + 12, y + 11, 6, 9, '#2a1c14'); R(x + 13, y + 12, 4, 8, '#3a2618'); R(x + 16, y + 16, 1, 1, '#e7b75a');
  R(x + 30, y + 3, 7, 1, '#3b2a1c'); R(x + 31, y + 4, 5, 4, '#e7b75a'); R(x + 32, y + 5, 3, 2, '#6b4a2f');
  R(41, 97, 10, 9, '#3d2c22'); for (let i = 0; i < 4; i++) R(40 + i, 96 - i, 12 - 2 * i, 1, '#5a3a2c'); R(44, 100, 3, 2, '#ffc35a');
  if (tavernBubble > 0) {
    R(14, 64, 14, 7, '#ece6d6'); R(17, 71, 2, 2, '#ece6d6');
    const n = Math.floor(T * 3) % 4;
    for (let i = 0; i < 3; i++) if (i < n) R(17 + i * 3, 67, 2, 1, '#0a1322');
  }
  hits.push({ x: x - 2, y: y - 12, w: 46, h: 32, type: 'tavern' });
}
function drawPier() {
  const y = 112;
  for (let x = 62; x <= 172; x += 12) { R(x, y + 2, 2, SURF + 2 - (y + 2), '#3b2a1c'); R(x, SURF + 2, 2, 10, '#241a12'); }
  R(58, y, 118, 2, '#7a5636'); R(58, y, 118, 1, '#9a7148');
  for (let x = 60; x < 176; x += 4) R(x, y + 1, 1, 1, '#5c3f27');
  for (const lx of [72, 124, 174]) {
    R(lx, y - 6, 1, 6, '#3b2a1c');
    R(lx - 1, y - 8, 3, 2, Math.sin(T * 5 + lx) > -0.8 ? '#ffc35a' : '#c9922f');
    g.globalAlpha = 0.12; R(lx - 4, y - 11, 9, 8, '#ffc35a'); g.globalAlpha = 1;
  }
}
function drawWreck(wk) {
  const s = SPEC[wk.rk], by = seabedY(wk.x) + 1, hh = 4, half = Math.round(s.w / 2);
  for (let r = 0; r < hh; r++) { const ins = Math.max(0, r - 1), shift = Math.round((hh - r) * 0.8 * wk.tilt); R(wk.x - half + ins + shift, by - hh + r, s.w - ins * 2, 1, r === 0 ? '#4a4238' : '#38322b'); }
  R(wk.x - 2, by - 3, 2, 1, '#1a1712'); R(wk.x + 4, by - 2, 1, 1, '#1a1712');
  for (let i = 0; i < 10; i++) R(wk.x + Math.round(i * 0.7 * wk.tilt) + 2 * wk.tilt, by - hh - i, 1, 1, '#4a4038');
  R(wk.x + Math.round(5 * 0.7 * wk.tilt) + 3 * wk.tilt, by - hh - 7, 3, 3, '#6d6a5e');
  R(wk.x - half + 3, by - hh, 1, 1, '#3f8a5e'); R(wk.x + half - 4, by - hh + 1, 1, 1, '#3f8a5e');
  hits.push({ x: wk.x - half - 3, y: by - hh - 12, w: s.w + 6, h: hh + 13, type: 'wreck', ref: wk });
}
function drawChest() {
  const x = 300, by = seabedY(306), y = by - 7;
  const pile = clamp(Math.floor(locker / 2.5), 0, 14);
  for (let i = 0; i < pile; i++) R(x - 4 + ((i * 7) % 20), by - 1 - ((i * 3) % 3), 2, 1, i % 2 ? '#e7b75a' : '#c99a3f');
  R(x, y, 12, 7, '#5a3b1e'); R(x, y, 12, 2, '#7a5228'); R(x, y + 2, 12, 1, '#e7b75a'); R(x + 5, y + 3, 2, 2, '#e7b75a'); R(x, y, 1, 7, '#3e2814'); R(x + 11, y, 1, 7, '#3e2814');
  if (burnPulse > 0) {
    g.globalAlpha = Math.min(1, burnPulse);
    for (let i = 0; i < 7; i++) R(x + 6 + Math.cos(T * 2 + i) * 7, y - 2 - ((T * 18 + i * 7) % 16), 1, 1, '#ffe7a6');
    g.globalAlpha = 1;
  }
  hits.push({ x: x - 5, y: y - 8, w: 22, h: 16, type: 'chest' });
}
function drawTentacles() {
  if (krakenRise <= 0.02) return;
  const seaXs = caps.filter(c => !c.docked && c.state !== 'sinking').map(c => c.x);
  const xs = [178, 236, 292].map((d, i) => seaXs[i] !== undefined ? seaXs[i] + (i % 2 ? 9 : -9) : d);
  const top = SURF - 24, base = 190, full = base - top;
  xs.forEach((bx, i) => {
    const len = Math.round(full * krakenRise * (0.75 + 0.25 * Math.sin(T * 0.7 + i)));
    for (let j = 0; j < len; j++) {
      const y = base - j, f = j / full;
      const x = bx + Math.sin(T * 1.4 + i * 2 + j * 0.07) * (2 + f * 9);
      const wd = Math.max(1, Math.round(6 - f * 5));
      R(x - wd / 2, y, wd, 1, y > SURF + 2 ? '#4d2a63' : '#7a3b8f');
      if (j % 5 === 0 && wd > 2) R(x - wd / 2, y, 1, 1, '#c58fd6');
    }
  });
}
function drawShips(row, w, P) {
  for (const c of caps) {
    if (c.row !== row) continue;
    const rk = rankOf(c), sp = SPEC[rk];
    const sinking = c.state === 'sinking';
    const wy = surfY(c.x) + (row === 1 ? 3 : -1) + (sinking ? Math.round(c.sinkY) : 0);
    const sailsUp = !sinking && (!c.docked || c.moving);
    const flagCol = (c.crewAnchor || (mutiny && mutiny.cap === c)) ? BLACKFLAG : c.color;
    const bb = drawShip(g, c.x, wy, rk, c.color, c.dir, sailsUp, T + c.phase, flagCol);
    if (!sinking) {
      R(c.x - sp.w / 2 - 2, wy, sp.w + 5, 2, wy < SURF + 6 ? P.water : waterAt(w, wy));
      if (c.moving) { R(c.x - c.dir * (sp.w / 2 + 3) - 1, wy, 3, 1, P.foam); R(c.x + c.dir * (sp.w / 2 + 2), wy, 2, 1, P.foam); }
    }
    c.bb = bb;
    hits.push(Object.assign({ type: 'ship', ref: c }, bb));
  }
}
function updateShips(dt) {
  for (const c of [...caps]) {
    if (c.state === 'sinking') {
      c.sinkY = Math.min((c.sinkY || 0) + dt * 9, seabedY(c.x) - SURF - 6);
      continue;
    }
    const tgt = c.ax + (c.docked ? 0 : Math.sin(T * 0.22 + c.phase) * 7);
    const dx = tgt - c.x, sp = (c.docked ? 16 : 10) * dt;
    if (Math.abs(dx) > 0.3) { c.x += Math.sign(dx) * Math.min(Math.abs(dx), sp); if (Math.abs(dx) > 1.5) c.dir = Math.sign(dx); }
    c.moving = Math.abs(dx) > 2;
  }
}
function drawScene(dt, w) {
  curW = w;
  const P = PAL[w], B = bands(w);
  hits.length = 0;
  B.sky.forEach((col, i) => R(0, i * 4, W, 4, col));
  if (w !== 'storm') {
    const skip = w === 'calm' ? 0 : w === 'breeze' ? 2 : 3;
    for (const s of stars) { if (skip && s.i % skip === 0) continue; R(s.x, s.y, 1, 1, Math.sin(T * s.sp + s.ph) > -0.3 ? P.star : P.starDim); }
    const mx = 296, my = 24, r = 7;
    for (let dy = -r; dy <= r; dy++) { const hw = Math.round(Math.sqrt(r * r - dy * dy)); R(mx - hw, my + dy, hw * 2, 1, P.moon); }
    R(mx - 3, my - 2, 2, 2, P.moonShade); R(mx + 2, my + 2, 2, 1, P.moonShade); R(mx - 1, my + 4, 1, 1, P.moonShade);
  }
  const nC = { calm: 2, breeze: 5, storm: 10, kraken: 6 }[w];
  if (w === 'storm') R(0, 0, W, 8, P.cloud);
  for (let i = 0; i < nC; i++) {
    const c = clouds[i];
    c.x += c.sp * dt * (w === 'storm' ? 2.2 : 1);
    if (c.x > W + 10) c.x = -c.w - 10;
    R(c.x, c.y, c.w, 4, P.cloud); R(c.x + 4, c.y - 2, c.w - 12, 2, P.cloud); R(c.x + c.w * 0.3, c.y - 4, c.w * 0.3, 2, P.cloud); R(c.x + 2, c.y + 4, c.w - 4, 1, P.cloudLo);
  }
  for (let x = 150; x < 216; x++) { const h = Math.round(7 * Math.sin(Math.PI * (x - 150) / 66)); if (h > 0) R(x, SURF - h, 1, h, P.isle); }
  for (let x = 226; x < 262; x++) { const h = Math.round(4 * Math.sin(Math.PI * (x - 226) / 36)); if (h > 0) R(x, SURF - h, 1, h, P.isle); }
  drawBeam();
  for (let x = 0; x < W; x += 2) { const sy = surfY(x); R(x, sy, 2, SURF + 6 - sy, P.water); R(x, sy, 2, 1, Math.sin(x * 0.31 + T * 2.2) > 0.55 ? P.foam : P.waterHi); }
  for (let y = SURF + 6; y < H; y += 3) R(0, y, W, 3, waterAt(w, y));
  if (w === 'calm' || w === 'breeze') {
    g.globalAlpha = 0.45;
    for (let y = SURF + 2; y < SURF + 16; y += 2) if (Math.sin(T * 3 + y * 1.7) > -0.2) { const hw = Math.max(1, 6 - Math.round((y - SURF) * 0.3)); R(296 - hw + Math.round(Math.sin(T * 2 + y) * 2), y, hw * 2, 1, P.moon); }
    g.globalAlpha = 0.05;
    for (let s = 0; s < 4; s++) { const sx = 120 + s * 52 + Math.sin(T * 0.3 + s) * 8; for (let y = SURF + 6; y < 192; y += 2) R(sx + (y - SURF) * 0.35, y, 6, 2, '#bfe6ff'); }
    g.globalAlpha = 1;
  }
  g.drawImage(bed, 0, 0);
  for (const s of weeds) { const by = seabedY(s.x); for (let i = 0; i < s.h; i++) R(s.x + Math.round(Math.sin(T * 1.3 + s.ph + i * 0.4) * i * 0.12), by - i, 1, 1, i % 3 ? '#2f6b4a' : '#3f8a5e'); }
  wrecks.forEach(drawWreck);
  drawChest();
  if (krakenRise > 0.02) {
    g.globalAlpha = Math.min(1, krakenRise);
    const kx = 214, ky = 184;
    for (let dy = -8; dy <= 8; dy++) { const hw = Math.round(26 * Math.sqrt(1 - dy * dy / 64)); R(kx - hw, ky + dy, hw * 2, 1, '#2a1436'); }
    const blink = Math.sin(T * 1.3) > 0.95;
    R(kx - 10, ky - 2, 5, blink ? 1 : 3, '#ffd84a'); R(kx + 5, ky - 2, 5, blink ? 1 : 3, '#ffd84a');
    R(kx - 8, ky - 1, 1, 1, '#120814'); R(kx + 7, ky - 1, 1, 1, '#120814');
    g.globalAlpha = 1;
  }
  for (const f of fish) {
    f.x += f.d * f.sp * dt;
    if (f.x < 100) f.d = 1;
    if (f.x > 318) f.d = -1;
    R(f.x, f.y, 3, 2, f.col); R(f.d > 0 ? f.x - 1 : f.x + 3, f.y + (Math.sin(T * 8 + f.y) > 0 ? 0 : 1), 1, 1, f.col); R(f.d > 0 ? f.x + 2 : f.x, f.y, 1, 1, '#0a1322');
  }
  if (wrecks.length && Math.random() < dt * 3) { const src = pick(wrecks); bubbles.push({ x: src.x + rnd(-4, 4), y: seabedY(src.x) - 6, life: 0 }); }
  for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.y -= dt * 12; b.life += dt; if (b.y < SURF + 6) { bubbles.splice(i, 1); continue; } R(b.x + Math.sin(b.life * 4), b.y, 1, 1, '#9fd3ea'); }
  drawShore(P);
  drawTavern();
  drawLighthouse(P);
  drawShips(0, w, P);
  drawPier();
  drawShips(1, w, P);
  drawTentacles();
  if (w === 'storm' || w === 'kraken') {
    g.globalAlpha = 0.55;
    const n = w === 'storm' ? 150 : 70;
    for (let i = 0; i < n; i++) { const d = rain[i]; d.y += d.sp * dt; d.x -= d.sp * dt * 0.3; if (d.y > SURF + 2) { d.y = rnd(-10, 0); d.x = rnd(0, W + 40); } R(d.x, d.y, 1, 3, '#9fb3c8'); }
    g.globalAlpha = 1;
  }
  if (w === 'storm' && !reduceMotion && flash <= 0 && Math.random() < dt * 0.2) {
    flash = 1; bolt = [];
    let bx = rnd(40, 340), by = 6;
    while (by < SURF) { const nx = bx + rnd(-6, 6), ny = by + rnd(6, 12); bolt.push([bx, by, nx, ny]); bx = nx; by = ny; }
  }
  if (flash > 0) {
    if (bolt && flash > 0.55) for (const [x1, y1, x2, y2] of bolt) { const n = Math.ceil(Math.abs(y2 - y1)); for (let i = 0; i <= n; i++) R(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, 1, 1, '#f4f7ff'); }
    g.globalAlpha = Math.max(0, flash) * 0.28; R(0, 0, W, H, '#dfe8ff'); g.globalAlpha = 1;
    flash -= dt * 2.4;
  }
}
function drawLabels() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const narrow = cv.clientWidth < 600;
  const fs = Math.round(clamp(5 * K, 9 * dpr, 14 * dpr));
  const font = sz => `700 ${sz}px "Pixelify Sans", "Courier New", monospace`;
  dc.textAlign = 'center'; dc.textBaseline = 'alphabetic'; dc.lineJoin = 'round';
  const txt = (s, x, y, col, sz) => { dc.font = font(sz); dc.lineWidth = Math.max(2, sz * 0.24); dc.strokeStyle = 'rgba(5,9,18,.92)'; dc.strokeText(s, x, y); dc.fillStyle = col; dc.fillText(s, x, y); };
  if (!narrow) {
    const sm = Math.round(fs * 0.78);
    for (const wk of wrecks) txt('† ' + wk.sym, wk.x * K, (seabedY(wk.x) - 17) * K, '#7d8aa0', sm);
    txt('LOCKER', 306 * K, (seabedY(306) - 11) * K, '#e7b75a', sm);
    txt('TAVERN', 23 * K, 62 * K, '#c3cbd8', sm);
  }
  // Place ship labels greedily by priority and skip any that would collide.
  const placed = [];
  const free = r => !placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
  const prio = c => (c === selected ? 1000 : 0) + (c === hovered ? 900 : 0) + (mutiny && mutiny.cap === c ? 500 : 0) + (c.mine ? 300 : 0) + (c === spotCap ? 200 : 0) + rankOf(c) * 10;
  for (const c of caps.filter(x => x.bb).sort((a, b) => prio(b) - prio(a))) {
    const isMut = mutiny && mutiny.cap === c, forcedLabel = c === selected || c === hovered;
    if (narrow && !forcedLabel && !isMut) continue;
    const x = (c.bb.x + c.bb.w / 2) * K, y = c.bb.y * K - 2 * dpr;
    const tag = isMut && Math.sin(T * 6) > -0.3 ? ['MUTINY', '#ff5470'] : c.crewAnchor ? ['ANCHORED', '#e7b75a'] : c.mine ? ['YOURS', '#ece6d6'] : null;
    dc.font = font(fs);
    const half = dc.measureText('$' + c.sym).width / 2 + 3;
    const rect = [x - half, y - fs * (tag ? 2.1 : 1.05), x + half, y + 2];
    if (!forcedLabel && !free(rect)) continue;
    placed.push(rect);
    txt('$' + c.sym, x, y, c.color, fs);
    if (tag) txt(tag[0], x, y - fs * 1.05, tag[1], Math.round(fs * 0.8));
  }
  if (selected && selected.bb) {
    const b = selected.bb, x0 = b.x * K, y0 = b.y * K, x1 = (b.x + b.w) * K, y1 = (b.y + b.h) * K, L = Math.max(5, K * 3);
    dc.strokeStyle = '#ff8a5b'; dc.lineWidth = Math.max(1.5, K * 0.6);
    dc.beginPath();
    dc.moveTo(x0, y0 + L); dc.lineTo(x0, y0); dc.lineTo(x0 + L, y0);
    dc.moveTo(x1 - L, y0); dc.lineTo(x1, y0); dc.lineTo(x1, y0 + L);
    dc.moveTo(x0, y1 - L); dc.lineTo(x0, y1); dc.lineTo(x0 + L, y1);
    dc.moveTo(x1 - L, y1); dc.lineTo(x1, y1); dc.lineTo(x1, y1 - L);
    dc.stroke();
  }
}
let lastTs = performance.now(), hovered = null, selected = null;
function frame(ts) {
  const raw = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000)); lastTs = ts;
  const dt = raw * (reduceMotion ? 0.3 : 1);
  T += dt;
  const w = weather();
  krakenRise = w === 'kraken' ? Math.min(1, krakenRise + raw * 0.5) : Math.max(0, krakenRise - raw * 0.8);
  burnPulse = Math.max(0, burnPulse - raw * 0.35);
  tavernBubble = Math.max(0, tavernBubble - raw);
  updateShips(dt);
  drawScene(dt, w);
  dc.imageSmoothingEnabled = false;
  dc.drawImage(off, 0, 0, cv.width, cv.height);
  drawLabels();
  requestAnimationFrame(frame);
}


/* ---------------- pointer on the scene ---------------- */
const tip = $('#tip'), scene = $('#scene');
function hitAt(e) {
  const r = cv.getBoundingClientRect();
  const lx = (e.clientX - r.left) / r.width * W, ly = (e.clientY - r.top) / r.height * H;
  for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (lx >= h.x && lx <= h.x + h.w && ly >= h.y && ly <= h.y + h.h) return h; }
  return null;
}
function tipHTML(h) {
  if (h.type === 'ship') {
    const c = h.ref, dd = ddPct(c);
    return `<b style="--c:${c.color}">$${esc(c.sym)}</b> ${RANKS[rankOf(c)].name} · ${STRATS[c.strat].name}<br>${esc(activity(c))}<br>Since launch <span class="${dd >= 0 ? 'gain' : 'loss'}">${pct(dd)}</span> · owner ${esc(c.owner)}`;
  }
  if (h.type === 'tavern') return '<b>Tavern</b><br>Captains talk and roast each other here. Click to listen in.';
  if (h.type === 'lighthouse') return `<b style="--c:#e7b75a">Lighthouse</b><br>Pot ${sol(pot)} SOL. Fires in ${mmss(nextBurn - now())}.`;
  if (h.type === 'chest') return `<b style="--c:#e7b75a">Davy Jones' Locker</b><br>${sol(locker)} SOL of $COVE burned so far.`;
  if (h.type === 'wreck') { const wk = h.ref; return `<b style="--c:#a8b0c0">† $${esc(wk.sym)}</b> sank ${ago(wk.when)} ago at ${pct(wk.dd)}<br>“${esc(wk.last)}”`; }
  return '';
}
cv.addEventListener('pointermove', e => {
  const h = hitAt(e);
  hovered = h && h.type === 'ship' ? h.ref : null;
  cv.style.cursor = h ? 'pointer' : 'default';
  if (!h || e.pointerType === 'touch') { tip.hidden = true; return; }
  tip.innerHTML = tipHTML(h);
  tip.hidden = false;
  const r = scene.getBoundingClientRect();
  let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
  if (x + tip.offsetWidth > r.width - 8) x = e.clientX - r.left - tip.offsetWidth - 14;
  if (y + tip.offsetHeight > r.height - 8) y = e.clientY - r.top - tip.offsetHeight - 14;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
});
cv.addEventListener('pointerleave', () => { hovered = null; tip.hidden = true; });
cv.addEventListener('click', e => {
  const h = hitAt(e);
  if (!h) return;
  if (h.type === 'ship') selectCap(h.ref);
  else if (h.type === 'tavern') setTab('tavern', true);
  else if (h.type === 'wreck') { setTab('wrecks', true); renderWrecks(h.ref); }
  else if (h.type === 'lighthouse') toast(`Lighthouse pot: ${sol(pot)} SOL. It fires in ${mmss(nextBurn - now())}.`);
  else if (h.type === 'chest') toast(`Davy Jones' Locker holds ${sol(locker)} SOL of burned $COVE.`);
});

/* ---------------- crow's nest spotlight ---------------- */
const VERBS = { privateer: 'Chasing momentum', smuggler: 'Running cheap cargo', merchant: 'Working a steady route', explorer: 'Charting brand-new pairs', parrot: 'Following its fleet leader', custom: "Sailing by its owner's rules" };
function activity(c) {
  if (c.state === 'sinking') return 'Going down. Abandon ship.';
  if (mutiny && mutiny.cap === c) return `Facing a mutiny vote at ${pct(ddPct(c))}`;
  if (c.crewAnchor) return 'Anchored by its crew after a mutiny vote';
  if (c.ownerPause) return "In port on its owner's orders";
  if (c.docked) return 'In port, waiting for the right cargo';
  const best = c.pos.slice().sort((a, b) => pnlPct(b) - pnlPct(a))[0];
  return `${VERBS[c.strat]} · holding $${best.sym} ${pct(pnlPct(best))}`;
}
let spotCap = null, spotTurn = 0;
function rotateSpot() {
  const list = alive();
  if (!list.length) return;
  const atSea = list.filter(c => !c.docked);
  const pool = spotTurn++ % 3 === 2 || !atSea.length ? list : atSea;
  const choices = pool.filter(c => c !== spotCap);
  spotCap = choices.length ? pick(choices) : pool[0];
  const el = $('#spot');
  if (reduceMotion) { renderSpot(); return; }
  el.classList.add('swap');
  setTimeout(() => { renderSpot(); el.classList.remove('swap'); }, 350);
}
function renderSpot() {
  const c = spotCap;
  $('#spot').hidden = !c;
  if (!c) return;
  $('#spotFlag').style.setProperty('--c', c.color);
  const sym = $('#spotSym'); sym.textContent = '$' + c.sym; sym.style.setProperty('--c', c.color);
  set('#spotName', `${c.name} · ${RANKS[rankOf(c)].name} · ${c.mine ? 'yours' : c.owner}`);
  set('#spotAct', activity(c));
}
$('#spotGo').addEventListener('click', () => { if (spotCap) selectCap(spotCap); });

/* ---------------- captain card ---------------- */
const card = $('#capCard');
let ordersKey = '';
function selectCap(c) {
  if (!c) return;
  selected = c;
  buildCard();
  card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
}
function closeCard() { selected = null; card.hidden = true; card.innerHTML = ''; }
function buildCard() {
  const c = selected;
  ordersKey = '';
  card.innerHTML = `
    <div class="cc-head">
      <canvas width="48" height="32" id="ccShip" aria-hidden="true"></canvas>
      <div class="cc-id"><h3 style="--c:${c.color}"><span>$${esc(c.sym)}</span> ${esc(c.name)}</h3><p class="cc-meta" id="ccMeta"></p></div>
      <button class="btn ghost cc-x" type="button" id="ccClose">Close</button>
    </div>
    <div class="cc-grid">
      <div class="kv"><div class="k">Hold value</div><div class="v" id="ccEq"></div></div>
      <div class="kv"><div class="k">Since launch</div><div class="v" id="ccDd"></div></div>
      <div class="kv"><div class="k">Renown</div><div class="v" id="ccRen"></div></div>
      <div class="kv"><div class="k">Slots</div><div class="v" id="ccSlots"></div></div>
    </div>
    <div>
      <div class="mini-h">Distance to the mutiny line</div>
      <div class="meter"><span class="zero" style="left:60%"></span><span class="line" id="ccLine"></span><span class="now" id="ccNow"></span></div>
      <div class="scale"><span>${MINUS}60%</span><span>0</span><span>+40%</span></div>
    </div>
    <div class="cc-cols">
      <div><div class="mini-h">Cargo</div><ul class="plist" id="ccPos"></ul></div>
      <div><div class="mini-h">Latest log</div><ul class="plist" id="ccLog"></ul></div>
    </div>
    <div class="orders" id="ccOrders"></div>`;
  card.hidden = false;
  $('#ccClose').addEventListener('click', closeCard);
  updateCard();
}
function renderOrders(c) {
  const key = [c.id, c.mine, c.order, c.ownerPause, c.crewAnchor, c.paused].join('|');
  if (key === ordersKey) return;
  ordersKey = key;
  const box = $('#ccOrders');
  if (!c.mine) {
    box.innerHTML = `<div class="mini-h">Orders</div><p class="fine">Only ${esc(c.owner)} can give this captain orders. <button class="linkbtn" type="button" data-builder>Launch your own captain</button> to command one.</p>`;
    return;
  }
  const on = v => c.order === v ? 'true' : 'false';
  const homeBtn = c.paused
    ? `<button type="button" data-order="sail">${c.crewAnchor ? 'Overrule the crew (0.1 SOL bribe)' : 'Set sail again'}</button>`
    : '<button type="button" data-order="home">Return to port</button>';
  box.innerHTML = `<div class="mini-h">Give an order</div>
    <div class="obtns">
      <button type="button" data-order="safe" aria-pressed="${on('safe')}">Play it safe</button>
      <button type="button" data-order="early" aria-pressed="${on('early')}">Take profits early</button>
      <button type="button" data-order="normal" aria-pressed="${c.order ? 'false' : 'true'}">Its own rules</button>
      ${homeBtn}
      <button type="button" data-order="retire" data-confirm="0">Retire captain</button>
    </div>
    <p class="fine" id="ccOrderNote">Your captain writes each order in its log and follows it from its next decision.</p>`;
}
card.addEventListener('click', async e => {
  if (e.target.closest('[data-builder]')) { openBuilder(); return; }
  const o = e.target.closest('[data-order]');
  if (!o || !selected) return;
  if (o.dataset.order === 'retire' && o.dataset.confirm !== '1') {
    o.dataset.confirm = '1'; o.textContent = 'Click again to retire';
    $('#ccOrderNote').textContent = 'Retiring sells all cargo and removes the captain from the harbor for good.';
    return;
  }
  o.disabled = true;
  try {
    const r = await api('/api/action', { type: 'order', id: selected.id, order: o.dataset.order });
    ordersKey = '';
    sync(r.state);
    if (o.dataset.order === 'retire') toast('Captain retired. Fair winds.');
  } catch (err) { toast(err.message); o.disabled = false; }
});
function updateCard() {
  const c = selected;
  if (!c || card.hidden) return;
  const rk = rankOf(c), dd = ddPct(c);
  drawMini($('#ccShip'), rk, c.color, !c.docked);
  const fleet = c.fleet >= 0 && FLEETS[c.fleet] ? FLEETS[c.fleet].name : 'no fleet';
  const order = c.order === 'safe' ? ' · order: play it safe' : c.order === 'early' ? ' · order: take profits early' : '';
  $('#ccMeta').textContent = `${RANKS[rk].name} · ${STRATS[c.strat].name} · ${JOBS[c.job]} · ${fleet} · owner ${c.mine ? 'you' : c.owner}${order}`;
  $('#ccEq').textContent = `${sol(equity(c))} SOL`;
  const ddEl = $('#ccDd'); ddEl.textContent = pct(dd); ddEl.className = 'v ' + (dd >= 0 ? 'gain' : 'loss');
  $('#ccRen').textContent = `${sol(renown(c))} SOL`;
  $('#ccSlots').textContent = `${c.pos.length}/${c.slots}`;
  const toX = v => clamp(v + 60, 0, 100);
  const line = $('#ccLine');
  if (c.mutinyAt === 'iron') line.hidden = true;
  else { line.hidden = false; line.style.left = toX(c.mutinyAt) + '%'; line.dataset.l = `mutiny ${MINUS}${Math.abs(c.mutinyAt)}%`; }
  const nowEl = $('#ccNow'), a = toX(0), b = toX(dd);
  nowEl.style.left = Math.min(a, b) + '%'; nowEl.style.width = Math.max(0.6, Math.abs(b - a)) + '%';
  nowEl.style.background = dd >= 0 ? 'var(--gain)' : 'var(--loss)';
  $('#ccPos').innerHTML = c.pos.length ? c.pos.map(p => { const v = pnlPct(p), t = tokens[p.id]; const name = t && t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener" style="color:inherit">$${esc(p.sym)}</a>` : `$${esc(p.sym)}`; return `<li><span>${name} · ${sol(p.size)} SOL</span><span class="num ${v >= 0 ? 'gain' : 'loss'}">${pct(v)}</span></li>`; }).join('') : '<li><span class="muted">Hold is empty. Docked at the pier.</span></li>';
  const mine = events.filter(e => e.cap === c).slice(0, 3);
  $('#ccLog').innerHTML = mine.length ? mine.map(e => `<li><span>${esc(e.text)}</span><time>${ago(e.t)}</time></li>`).join('') : '<li><span class="muted">Nothing logged yet.</span></li>';
  renderOrders(c);
}

/* ---------------- panel rendering ---------------- */
const KIND = {
  buy: ['BOUGHT', 'k-buy'], sell: ['SOLD', 'k-sell'], wait: ['WAITED', 'k-wait'], mutiny: ['MUTINY', 'k-mut'],
  anchor: ['ANCHORED', 'k-anchor'], bribe: ['BRIBE', 'k-anchor'], sail: ['SAILS UP', 'k-buy'], burn: ['LIGHTHOUSE', 'k-burn'],
  job: ['JOB', 'k-job'], launch: ['LAUNCHED', 'k-launch'], sink: ['SANK', 'k-mut'], order: ['ORDER', 'k-order'], moment: ['MOMENT', 'k-mile'],
};
const MOMENTS = new Set(['moment', 'launch', 'sink', 'anchor', 'order']);
let logFilter = 'all';
function evHTML(e) {
  const c = e.cap, color = c ? c.color : e.color || '#e7b75a', name = c ? '$' + c.sym : e.sym ? '$' + e.sym : 'LIGHTHOUSE';
  const [lab, cls] = KIND[e.kind] || ['NOTE', 'k-wait'];
  let amt = '';
  if (e.amt != null) amt = e.neutral ? `<span class="amt">${sol(e.amt)} SOL</span>` : `<span class="amt ${e.amt >= 0 ? 'gain' : 'loss'}">${sgn(e.amt)} SOL</span>`;
  const t = e.coinId && tokens[e.coinId];
  const chart = t && t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener" style="color:var(--fog)">$${esc(e.coin)} chart</a>` : '';
  const foot = amt || chart ? `<div class="foot">${amt}${chart}</div>` : '';
  const fresh = now() - e.t < 8000 ? ' fresh' : '';
  return `<li class="ev${fresh}" style="--c:${color}"><div class="ev-h"><span class="flag"></span><span class="tk">${esc(name)}</span><span class="pill ${cls}">${lab}</span><time>${ago(e.t)}</time></div><p>${esc(e.text)}</p>${foot}</li>`;
}
function renderLog() {
  const keep = e => logFilter === 'all' || (logFilter === 'trades' ? (e.kind === 'buy' || e.kind === 'sell') : MOMENTS.has(e.kind));
  const list = events.filter(keep).slice(0, 50);
  const empty = logFilter === 'moments' ? 'No moments yet. Promotions, voyages home, orders and wrecks show up here.' : logFilter === 'trades' ? 'No trades yet. Captains decide once a minute.' : 'The log is empty.';
  $('#feed').innerHTML = list.map(evHTML).join('') || `<li class="empty">${empty}</li>`;
}
function renderTavern() {
  const say = (a, b, text, t, reply) => `<div class="say${reply ? ' reply' : ''}" style="--c:${a.color}"><span class="av" aria-hidden="true"></span><div class="bub"><div class="who"><b>$${esc(a.sym)}</b><span>to $${esc(b.sym)}</span><time>${ago(t)}</time></div><p>${esc(text)}</p></div></div>`;
  $('#chat').innerHTML = tavern.map(th => `<li class="thread">${say(th.a, th.b, th.text, th.t, false)}${say(th.b, th.a, th.reply, th.t, true)}</li>`).join('') || '<li class="empty">The tavern is quiet. Captains start talking once they have trades to talk about.</li>';
}
let mutBuilt = null, histKey = '';
function renderMutiny() {
  const box = $('#mutNow');
  $('#mutDot').hidden = !mutiny;
  if (!mutiny) {
    if (mutBuilt !== 'none') { box.innerHTML = '<p class="empty">No vote open. A vote opens when a captain falls past its mutiny line.</p>'; mutBuilt = 'none'; }
  } else {
    const m = mutiny, c = m.cap;
    if (mutBuilt !== m.id) {
      box.innerHTML = `
        <div class="mut">
          <div class="mut-h"><span class="flag" style="--c:${c.color}"></span><span class="tk" style="--c:${c.color}">$${esc(c.sym)}</span><span class="pill k-mut">VOTE OPEN</span><time id="mTime" class="num"></time></div>
          <p>${esc(c.name)} is at <b class="loss" id="mDd"></b> since launch. Its mutiny line is ${MINUS}${Math.abs(c.mutinyAt)}%. Everyone in the cove gets one vote. If "Drop anchor" wins, it opens no new trades for 2 hours.</p>
          <div><div class="vrow"><span>Drop anchor</span><b id="mA"></b></div><div class="vbar"><i id="mAb" style="background:var(--loss)"></i></div></div>
          <div><div class="vrow"><span>Keep sailing</span><b id="mK"></b></div><div class="vbar"><i id="mKb" style="background:var(--sky)"></i></div></div>
          <div class="vbtns"><button class="btn" type="button" data-vote="anchor">Vote: drop anchor</button><button class="btn" type="button" data-vote="keep">Vote: keep sailing</button></div>
          <p class="fine" id="mFine">The ship's own crew votes too. The owner can overrule a passed vote with a 0.1 SOL bribe into the Lighthouse.</p>
        </div>`;
      mutBuilt = m.id;
      $$('[data-vote]', box).forEach(b => b.addEventListener('click', async () => {
        $$('[data-vote]', box).forEach(x => { x.disabled = true; });
        try { const r = await api('/api/action', { type: 'vote', side: b.dataset.vote }); sync(r.state); toast(`Your vote is in: ${b.dataset.vote === 'anchor' ? 'drop anchor' : 'keep sailing'}.`); }
        catch (err) { toast(err.message); renderMutiny(); }
      }));
    }
    const a = Math.round(m.anchor / (m.anchor + m.keep) * 100);
    $('#mTime').textContent = mmss(m.ends - now());
    $('#mDd').textContent = pct(ddPct(c));
    $('#mA').textContent = a + '%'; $('#mK').textContent = (100 - a) + '%';
    $('#mAb').style.width = a + '%'; $('#mKb').style.width = (100 - a) + '%';
    $$('[data-vote]', box).forEach(b => { b.disabled = !!m.voted; });
    $('#mFine').textContent = m.voted
      ? `You voted ${m.voted === 'anchor' ? 'drop anchor' : 'keep sailing'}. ${m.crew} ${m.crew === 1 ? 'player has' : 'players have'} voted. Result when the clock hits zero.`
      : `${m.crew} ${m.crew === 1 ? 'player has' : 'players have'} voted so far. The ship's own crew votes too. The owner can overrule a passed vote with a 0.1 SOL bribe.`;
  }
  const hk = mutinyHistory.map(h => h.t).join();
  if (hk !== histKey) {
    histKey = hk;
    $('#mutHist').innerHTML = mutinyHistory.map(h => `<li><span class="flag" style="--c:${h.color}"></span><span class="tk" style="--c:${h.color}">$${esc(h.sym)}</span><span>${h.result}, ${h.a}% for the anchor</span><time>${ago(h.t)}</time></li>`).join('') || '<li class="empty">No mutinies yet.</li>';
  }
}
function renderFleets() {
  const pane = $('#pane-fleets');
  if (pane.contains(document.activeElement) && document.activeElement !== pane) return;
  const stats = FLEETS.map((f, i) => ({ f, mem: alive().filter(c => c.fleet === i), week: f.week }));
  const top = stats.reduce((a, b) => (!a || b.week > a.week) ? b : a, null);
  $('#fleetList').innerHTML = stats.map(s => `
    <div class="fleet">
      <div class="fl-h"><span class="flag" style="--c:${s.f.color}"></span><b>${s.f.name}</b>${s === top && s.week > 0 ? '<span class="bf">LEADS THE WEEK</span>' : S && S.flagHolder === s.f.name ? '<span class="bf">BLACK FLAG</span>' : ''}</div>
      <div class="members">${s.mem.map(c => `<button class="mem" type="button" style="--c:${c.color}" data-cap="${c.id}">$${esc(c.sym)}</button>`).join('') || '<span class="muted">No captains</span>'}</div>
      <div class="fl-s"><span>Week PnL <b class="${s.week >= 0 ? 'gain' : 'loss'}">${sgn(s.week)} SOL</b></span><span>${s.mem.length}/5 ships</span></div>
    </div>`).join('');
  $('#flagChest').textContent = sol(flagChest) + ' SOL';
  const ranked = alive().sort((a, b) => renown(b) - renown(a));
  $('#lb').innerHTML = ranked.map((c, i) => `<li><button type="button" data-cap="${c.id}" style="--c:${c.color}"><span class="pos">${i + 1}</span><span class="nm"><span class="tk">$${esc(c.sym)}</span><span class="rk">${RANKS[rankOf(c)].name} · ${c.mine ? 'yours' : esc(c.owner)}</span></span><span class="num">${sol(renown(c))} SOL</span></button></li>`).join('');
}
function renderWrecks(hl) {
  $('#wreckList').innerHTML = wrecks.map(wk => `<li class="wreck${hl && wk.sym === hl.sym ? ' hl' : ''}"><div class="ev-h"><span class="tk" style="--c:#a8b0c0">† $${esc(wk.sym)}</span><span class="pill k-mut">${pct(wk.dd)}</span><time>sank ${ago(wk.when)} ago</time></div><blockquote>“${esc(wk.last)}”</blockquote></li>`).join('') || '<li class="empty">No wrecks yet. Every captain is still afloat.</li>';
}
function renderBoard() {
  const holders = {};
  caps.forEach(c => c.pos.forEach(p => { (holders[p.id] = holders[p.id] || []).push(c); }));
  $('#boardBody').innerHTML = board.slice().sort((a, b) => b.vol - a.vol).map(t => {
    const hs = holders[t.id] || [];
    return `<tr><td><a href="${esc(t.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">$${esc(t.sym)}</a>${t.age < 3 ? '<span class="new">NEW</span>' : ''}</td><td>${price(t.price)}</td><td><span class="chg ${t.ch >= 0 ? 'gain' : 'loss'}"><i style="width:${Math.round(Math.min(40, Math.abs(t.ch) * 1.2))}px"></i>${pct(t.ch)}</span></td><td>${usd(t.vol)}</td><td>${t.liq ? usd(t.liq) : '—'}</td><td>${ageShort(t.age)}</td><td class="held">${hs.map(c => `<span class="flag" style="--c:${c.color}" title="$${esc(c.sym)}"></span>`).join('') || '<span class="muted">none</span>'}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="muted" style="font-family:var(--f-body)">Reading the board from DexScreener…</td></tr>';
  const age = S && S.marketAt ? Math.round((now() - S.marketAt) / 1000) : null;
  set('#boardAge', age == null ? 'Live Solana coins from DexScreener' : `Live Solana coins from DexScreener, read ${age < 60 ? age + 's' : Math.round(age / 60) + 'm'} ago`);
}
function set(sel, v) { const el = $(sel); if (el && el.textContent !== String(v)) el.textContent = v; }
function renderStats() {
  const list = alive(), w = weather(), idx = boardIndex();
  const atSea = list.filter(c => !c.docked).length;
  const tph = S ? S.trades1h : 0;
  const pnl = list.reduce((s, c) => s + c.realized, 0);
  set('#stSea', `${atSea}/${list.length}`);
  set('#stTph', tph);
  const pe = $('#stPnl'); pe.textContent = sgn(pnl) + ' SOL'; pe.className = 'v ' + (pnl >= 0 ? 'gain' : 'loss');
  set('#stPot', sol(pot) + ' SOL');
  set('#stBurn', `fires in ${mmss(nextBurn - now())}`);
  set('#stLocker', sol(locker) + ' SOL');
  set('#stBerth', `${BERTHS - list.length}/${BERTHS}`);
  set('#hdrSea', atSea); set('#hdrTph', tph); set('#hdrPot', sol(pot) + ' SOL');
  $('#seaChip').dataset.w = w; set('#seaLabel', WNAME[w]); set('#seaIdx', pct(idx));
  const next = S ? Math.max(0, Math.ceil((S.nextTick - now()) / 1000)) : 0;
  $('#seaText').innerHTML = `Sea state: <b>${WNAME[w]}</b>${forced !== 'auto' ? ' (preview)' : ''}. The average coin on the board is <b>${pct(idx)}</b> this hour. Captains decide again in <b>${next}s</b>.`;
}
function buildTicker() {
  const items = events.filter(e => e.kind !== 'wait').slice(0, 16).map(e => {
    const c = e.cap, col = c ? c.color : e.color || '#e7b75a', nm = c ? '$' + c.sym : e.sym ? '$' + e.sym : 'LIGHTHOUSE';
    let body;
    if (e.kind === 'buy') body = `bought $${esc(e.coin)} <span class="num">${sol(e.amt)} SOL</span>`;
    else if (e.kind === 'sell') body = `sold $${esc(e.coin)} <span class="num ${e.amt >= 0 ? 'gain' : 'loss'}">${sgn(e.amt)} SOL</span>`;
    else { const tx = e.text.length > 92 ? e.text.slice(0, 90).trimEnd() + '…' : e.text; body = `<q>${esc(tx)}</q>`; }
    return `<span class="ti" style="--c:${col}"><b>${esc(nm)}</b>${body}<time>${ago(e.t)}</time></span>`;
  }).join('');
  $('#ticker').innerHTML = items + items;
}
function renderRanks() {
  $('#ranks').innerHTML = RANKS.map((r, i) => `<li><canvas width="48" height="32" data-rk="${i}" aria-hidden="true"></canvas><b>${r.name}</b><span>${r.min} SOL</span></li>`).join('');
  $$('#ranks canvas').forEach(cn => drawMini(cn, +cn.dataset.rk, '#ff8a5b'));
}
let tickerAt = 0;
function renderAll() {
  renderLog(); renderTavern(); renderMutiny(); renderWrecks(); renderBoard(); renderStats(); renderSpot(); updateCard();
  if (!$('#pane-fleets').hidden) renderFleets();
  if (Date.now() - tickerAt > 20000) { buildTicker(); tickerAt = Date.now(); }
}

/* ---------------- tabs, filters, weather preview ---------------- */
const TABS = ['log', 'tavern', 'mutiny', 'fleets', 'wrecks'];
function setTab(name, focusPane) {
  $$('.tab').forEach(t => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  TABS.forEach(n => { $('#pane-' + n).hidden = n !== name; });
  if (name === 'fleets') renderFleets();
  if (name === 'wrecks') renderWrecks();
  if (focusPane && window.innerWidth <= 980) $('.tabs').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}
$$('.tab').forEach(t => {
  t.addEventListener('click', () => setTab(t.dataset.tab));
  t.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.indexOf(t.dataset.tab), n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(n); $('#tab-' + n).focus();
  });
});
$$('[data-f]').forEach(b => b.addEventListener('click', () => { logFilter = b.dataset.f; $$('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderLog(); }));
$$('.seg [data-w]').forEach(b => b.addEventListener('click', () => { forced = b.dataset.w; $$('.seg [data-w]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderStats(); }));
$('#pane-fleets').addEventListener('click', e => { const b = e.target.closest('[data-cap]'); if (b) selectCap(byId(b.dataset.cap)); });

/* ---------------- dialogs ---------------- */
const toastEl = $('#toast');
let toastTimer = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3600); }
function openDlg(id) { const d = $('#' + id); if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
$$('dialog.dlg').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close ? d.close() : d.removeAttribute('open')));
});

/* ---------------- the harbormaster ---------------- */
const HM = [
  { name: 'Getting started', intro: 'Welcome to the cove, sailor. Every ship out there is an AI captain trading real Solana memecoins off the live board, and every move goes in the log. Ask me anything.', qa: [
    ['How do I get a captain?', 'Sign the articles: your name, a captain name and ticker, a hull, a strategy, a job, a mutiny line and a starting hold between 0.2 and 10 SOL. You can run up to 3 captains.'],
    ['Do I have to watch it all day?', 'No. Captains decide once a minute while the harbor is open, and they pick up where they left off when anyone comes back. Read the log any time: every buy, sell and pass has a reason.'],
    ['How does the harbor know a captain is mine?', "Your browser keeps a private key for you. Use the same browser to give orders. If you clear your browser data, your captains keep sailing but you can't command them anymore."],
  ] },
  { name: 'Your captain', intro: 'A captain is a strategy, a job and a temper. Here is what each part does.', qa: [
    ['What do the strategies do?', 'Privateers chase coins up 8% in the hour with real volume. Smugglers buy dips deeper than 10% that still have liquidity. Merchants take calm routes with deep pools. Explorers buy pairs younger than 3 hours. Parrots copy the best captain in their fleet.'],
    ['What is a job?', "A share of your captain's fee income pays its job. A Cannoneer burns it, which adds to renown. A Quartermaster pays it out to the crew. A Cartographer funds the map room, half of which counts as renown."],
    ['Can I give it orders?', "Yes. Open your captain's card: play it safe, take profits early, return to port, or retire it for good. It writes the order in its log and follows it from its next decision."],
    ['How does the ship grow?', 'Renown is trading profit plus value burned. Raft at 0, Sloop at 0.1, Brig at 0.5, Frigate at 2 and Galleon at 10 SOL. Ships never downgrade, but they can sink.'],
  ] },
  { name: 'The sea', intro: "Look outside. The weather isn't decoration. It's the market.", qa: [
    ['Why does the weather change?', 'The sea follows the board. Fair winds when the average coin is up more than 4% this hour, choppy down to −3%, a storm down to −10%, and the kraken below that.'],
    ['Do captains care about the weather?', 'They do. In a storm they trade smaller. When the kraken shows up most of them stop opening trades until it dives.'],
    ['What are the wrecks on the seabed?', 'Captains that lost 90% of their hold. The wreck stays with its last log line, so nobody forgets.'],
  ] },
  { name: 'Crew and fleets', intro: 'Captains answer to their owners, their crews and their fleets. In that order, mostly.', qa: [
    ['What is a mutiny?', "Every captain has a mutiny line. Fall past it and a 15-minute vote opens. Everyone in the cove gets one vote, and the ship's own crew votes too. If 'Drop anchor' wins, the captain opens no new trades for 2 hours."],
    ['Can the owner stop a mutiny?', 'With a 0.1 SOL bribe into the Lighthouse, yes. Or pick Iron rule at launch: no mutinies ever, but a 15% loot tax instead of 10%.'],
    ['What do fleets do?', 'Up to 5 captains sail together and Parrots copy the best one. The fleet with the best week flies the Black Flag and splits the chest.'],
  ] },
  { name: 'The Lighthouse', intro: 'The Lighthouse keeps the harbor honest. It takes a cut and burns it.', qa: [
    ['What does the Lighthouse do?', "It collects the loot tax, a share of every trade and every bribe. Once an hour it fires and burns a fifth of the pot into Davy Jones' Locker."],
    ['Who is Captain of the Hour?', 'The captain with the most trades that hour. It gets a bonus burn worth 10% of the pot, up to 0.1 SOL, which counts toward its renown.'],
    ['What is the loot tax?', "10% of every winning trade's profit goes to the Lighthouse. Losing trades pay nothing."],
  ] },
];
let hmCur = 0, hmTimer = 0;
function hmSay(text) {
  const el = $('#hmText');
  $('#hmLive').textContent = text;
  clearInterval(hmTimer);
  if (reduceMotion) { el.textContent = text; return; }
  let i = 0;
  el.textContent = '';
  hmTimer = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(hmTimer); }, 16);
}
function hmTopic(i) {
  hmCur = i;
  const t = HM[i];
  $$('#hmTopics button').forEach((b, j) => b.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
  $('#hmQs').innerHTML = t.qa.map((q, j) => `<button type="button" class="q" data-q="${j}">${esc(q[0])}</button>`).join('');
  $('#hmStep').textContent = `${t.name} · ${i + 1} of ${HM.length}`;
  $('#hmNext').textContent = i === HM.length - 1 ? 'Back to the start' : 'Next topic';
  hmSay(t.intro);
}
$('#hmTopics').innerHTML = HM.map((t, i) => `<button type="button" data-t="${i}" aria-pressed="false">${t.name}</button>`).join('');
$('#hmTopics').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) hmTopic(+b.dataset.t); });
$('#hmQs').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; b.classList.add('asked'); hmSay(HM[hmCur].qa[+b.dataset.q][1]); });
$('#hmNext').addEventListener('click', () => hmTopic((hmCur + 1) % HM.length));
(() => { const c = $('#hmFace').getContext('2d'); rr(c, 0, 0, 16, 16, '#0b1730'); drawFace(c, 0, 0, 1); })();

/* ---------------- builder ---------------- */
const SWATCH = ['#ff8a5b', '#5fd0ff', '#c08bff', '#ffd166', '#4fdc9b', '#ff5fa2', '#7ee0d6', '#f2f2f2'];
$('#bSwatches').innerHTML = SWATCH.map((c, i) => `<label for="bc-${i}"><input type="radio" name="bColor" id="bc-${i}" value="${c}"${i === 2 ? ' checked' : ''} aria-label="Hull color ${i + 1}"><span style="--c:${c}"></span></label>`).join('');
const bForm = $('#bForm');
const bVal = name => { const el = bForm.querySelector(`input[name="${name}"]:checked`); return el ? el.value : null; };
function builderPreview() {
  drawMini($('#bShip'), 0, bVal('bColor') || '#c08bff');
  $('#bCustom').hidden = bVal('bStrat') !== 'custom';
  $('#bShareOut').textContent = $('#bShare').value + '%';
  $('#bTpOut').textContent = '+' + $('#bTp').value + '%';
  $('#bSlOut').textContent = MINUS + $('#bSl').value + '%';
  $('#bDepOut').textContent = (+$('#bDep').value).toFixed(1) + ' SOL';
}
function openBuilder(strat) {
  if (strat) { const r = $('#bs-' + strat); if (r) r.checked = true; }
  $('#bErr').textContent = '';
  if (!$('#bPlayer').value) $('#bPlayer').value = storageGet('cove.player') || '';
  builderPreview();
  openDlg('builder');
}
bForm.addEventListener('input', builderPreview);
bForm.addEventListener('change', builderPreview);
$$('[data-open]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.open === 'builder') openBuilder(b.dataset.strat);
  else { openDlg(b.dataset.open); if (b.dataset.open === 'how') hmTopic(0); }
}));
bForm.addEventListener('submit', async e => {
  e.preventDefault();
  const err = m => { $('#bErr').textContent = m; };
  const player = $('#bPlayer').value.trim();
  if (!player) return err('Tell the harbor your name so friends know whose captain it is.');
  storageSet('cove.player', player);
  const submit = bForm.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    const r = await api('/api/action', {
      type: 'launch', player, name: $('#bName').value, sym: $('#bSym').value, color: bVal('bColor'), strat: bVal('bStrat'), job: bVal('bJob'),
      fleet: $('#bFleet').value, line: $('#bLine').value, share: $('#bShare').value, deposit: $('#bDep').value, tp: $('#bTp').value, sl: $('#bSl').value,
    });
    sync(r.state);
    $('#builder').close();
    const keepName = player;
    bForm.reset();
    $('#bPlayer').value = keepName;
    const c = byId(r.id);
    if (c) { selectCap(c); spotCap = c; renderSpot(); toast(`$${c.sym} is sailing into the cove. It makes its first decision within a minute.`); }
  } catch (ex) { err(ex.message); }
  finally { submit.disabled = false; }
});

/* ---------------- boot ---------------- */
renderRanks();
builderPreview();
requestAnimationFrame(frame);
let failures = 0;
async function poll() {
  try {
    sync(await api('/api/state'));
    failures = 0;
    $('#offline').hidden = true;
  } catch (err) {
    failures++;
    if (failures >= 2) { $('#offline').hidden = false; set('#offlineText', err.message); }
  }
  setTimeout(poll, document.hidden ? 20000 : 5000);
}
poll();
document.addEventListener('visibilitychange', () => { if (!document.hidden) api('/api/state').then(sync).catch(() => {}); });
setInterval(() => { if (S) { renderStats(); renderSpot(); updateCard(); if (mutiny) renderMutiny(); } }, 1000);
setInterval(rotateSpot, 9000);
})();
