/* COVE promo: a 15-second 1920x1080 harbor film rendered frame by frame and encoded to H.264 MP4 with WebCodecs. */
(() => {
'use strict';
const { rr, SPEC, BLACKFLAG, drawShip } = window.CoveSprites;

const W = 384, H = 216, SURF = 120, SCALE = 5, OW = W * SCALE, OH = H * SCALE, FPS = 30, DUR = 15;
const cv = document.getElementById('out');
const dc = cv.getContext('2d');
const off = document.createElement('canvas'); off.width = W; off.height = H;
const g = off.getContext('2d');
const R = (x, y, w, h, c) => rr(g, x, y, w, h, c);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const smooth = (e0, e1, x) => { const k = clamp((x - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); };
const easeOut = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = x => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let k = Math.imul(seed ^ seed >>> 15, 1 | seed); k = k + Math.imul(k ^ k >>> 7, 61 | k) ^ k; return ((k ^ k >>> 14) >>> 0) / 4294967296; }; }
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgb = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
const mixA = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];

/* ---------------- weather ---------------- */
const PAL = {
  calm: { top: '#060f24', hor: '#1d3b6e', water: '#16496f', waterHi: '#2a6a93', deep: '#030c18', foam: '#9ad6f0', isle: '#10244a', cloud: '#16284a', cloudLo: '#1b3157', rock: '#1d2632', rockHi: '#34444a', rockDeep: '#111823', grass: '#2c4a36' },
  breeze: { top: '#091327', hor: '#2a4466', water: '#153f5e', waterHi: '#2d6283', deep: '#040d18', foam: '#bde0ee', isle: '#16294a', cloud: '#22324f', cloudLo: '#2a3b5a', rock: '#1d2632', rockHi: '#34444a', rockDeep: '#111823', grass: '#2a4634' },
  storm: { top: '#0b0e13', hor: '#36404e', water: '#1a3441', waterHi: '#2f5363', deep: '#050a0f', foam: '#d6e2e6', isle: '#1e252e', cloud: '#1d232c', cloudLo: '#262d37', rock: '#1c2229', rockHi: '#2c353b', rockDeep: '#10151b', grass: '#26392e' },
  kraken: { top: '#10071a', hor: '#4d2048', water: '#29204a', waterHi: '#47366d', deep: '#06030d', foam: '#cfaee6', isle: '#2b1331', cloud: '#24122c', cloudLo: '#2e1838', rock: '#1f1a2a', rockHi: '#3a2d44', rockDeep: '#120e19', grass: '#2e3b36' },
};
const PA = {};
for (const w in PAL) { PA[w] = {}; for (const k in PAL[w]) PA[w][k] = hex(PAL[w][k]); }
const WX = [[0, 'calm'], [5.0, 'calm'], [5.5, 'storm'], [6.2, 'storm'], [6.7, 'kraken'], [7.7, 'kraken'], [8.5, 'breeze'], [12.2, 'breeze'], [12.9, 'calm'], [99, 'calm']];
function weights(t) {
  const w = { calm: 0, breeze: 0, storm: 0, kraken: 0 };
  for (let i = 0; i < WX.length - 1; i++) {
    const [t0, a] = WX[i], [t1, b] = WX[i + 1];
    if (t >= t0 && t < t1) { const f = a === b ? 0 : smooth(t0, t1, t); w[a] += 1 - f; w[b] += f; return w; }
  }
  w.calm = 1; return w;
}
function palette(w) {
  const out = {};
  for (const k in PA.calm) {
    const c = [0, 0, 0];
    for (const name in w) for (let j = 0; j < 3; j++) c[j] += PA[name][k][j] * w[name];
    out[k] = c;
  }
  return out;
}

/* ---------------- fixed props, seeded so every render is identical ---------------- */
const rand = rng(42);
const STARS = Array.from({ length: 80 }, () => ({ x: Math.floor(rand() * W), y: Math.floor(rand() * 96), ph: rand() * 6.28, sp: 0.8 + rand() * 1.8 }));
const WEEDS = [100, 108, 141, 152, 178, 189, 226, 237, 250, 284, 292, 316].map(x => ({ x, h: 6 + Math.floor(rand() * 9), ph: rand() * 6 }));
const FISH = Array.from({ length: 7 }, (_, i) => ({ y: 136 + Math.floor(rand() * 50), sp: 3 + rand() * 5, off: rand() * 400, col: ['#e7b75a', '#7fb6ff', '#ff8a5b', '#9fe0c8'][i % 4] }));
const CLOUDS = Array.from({ length: 10 }, () => ({ x: rand() * (W + 100), y: 6 + Math.floor(rand() * 40), w: 30 + Math.floor(rand() * 50), sp: 1.5 + rand() * 2.5 }));
const RAIN = Array.from({ length: 150 }, () => ({ x: rand() * (W + 40), y: rand() * (SURF + 10), sp: 90 + rand() * 50 }));
const FLASHES = [5.62, 6.08].map((at, i) => { const r = rng(7 + i); const bolt = []; let bx = 60 + r() * 220, by = 6; while (by < SURF) { const nx = bx + (r() - 0.5) * 12, ny = by + 6 + r() * 6; bolt.push([bx, by, nx, ny]); bx = nx; by = ny; } return { at, bolt }; });
const seabedY = x => 200 + Math.round(2 * Math.sin(x * 0.07) + 1.5 * Math.sin(x * 0.19 + 1));
const bed = document.createElement('canvas'); bed.width = W; bed.height = H;
(() => { const b = bed.getContext('2d'); for (let x = 0; x < W; x++) { const y = seabedY(x); rr(b, x, y, 1, H - y, '#2d2a23'); rr(b, x, y, 1, 1, '#4b4535'); if ((x * 13) % 7 === 0) rr(b, x, y + 2 + ((x * 3) % 5), 1, 1, '#3c392f'); if ((x * 17) % 23 === 0) rr(b, x - 1, y - 1, 3, 1, '#3d4a44'); } })();

/* ---------------- the cast ---------------- */
const SINK_AT = 10.0, SINK_LEN = 1.5;
const SHIPS = [
  { sym: 'GULLBEARD', color: '#ff8a5b', rk: 4, row: 1, keys: [[0, 258]], sea: true, ph: 0.3 },
  { sym: 'MAREE', color: '#5fd0ff', rk: 3, row: 0, keys: [[0, 300]], sea: true, ph: 1.7 },
  { sym: 'PEGLEG', color: '#9fb4ff', rk: 2, row: 0, keys: [[0, 214]], sea: true, ph: 2.9, mutiny: 7.8, sink: SINK_AT },
  { sym: 'RUMBOT', color: '#ffd166', rk: 1, row: 1, keys: [[0, 84], [2.8, 84], [4.8, 184]], depart: 2.8, ph: 4.1 },
  { sym: 'POLLY', color: '#4fdc9b', rk: 1, row: 1, keys: [[0, 104], [3.1, 104], [5.1, 222]], depart: 3.1, ph: 5.3 },
  { sym: 'SEADOG', color: '#ff5fa2', rk: 1, row: 1, keys: [[0, 128]], ph: 0.9 },
  { sym: 'NAVI', color: '#7ee0d6', rk: 0, row: 1, keys: [[0, 148]], ph: 2.2 },
];
function shipX(s, t) {
  const k = s.keys;
  if (t <= k[0][0]) return { x: k[0][1], v: 0 };
  for (let i = 0; i < k.length - 1; i++) {
    const [t0, x0] = k[i], [t1, x1] = k[i + 1];
    if (t >= t0 && t < t1) { const f = (t - t0) / (t1 - t0); return { x: lerp(x0, x1, easeInOut(f)), v: x1 - x0 }; }
  }
  return { x: k[k.length - 1][1], v: 0 };
}

/* ---------------- scene ---------------- */
function drawScene(t) {
  const w = weights(t), P = palette(w);
  const amp = w.calm * 0.7 + w.breeze * 1.3 + w.storm * 2.4 + w.kraken * 2.8;
  const surfY = x => SURF + Math.round(amp * Math.sin(x * 0.09 + t * 1.6) + amp * 0.5 * Math.sin(x * 0.23 - t * 2.3));
  const waterAt = y => rgb(mixA(P.water, P.deep, Math.pow(clamp((y - SURF) / (H - SURF), 0, 1), 0.8)));
  const clear = 1 - w.storm;
  const kf = w.kraken / (w.calm + w.breeze + w.kraken + 1e-6);
  const kr = smooth(6.3, 7.0, t) * (1 - smooth(7.6, 8.4, t));

  // sky
  const n = Math.ceil((SURF + 6) / 4);
  for (let i = 0; i < n; i++) R(0, i * 4, W, 4, rgb(mixA(P.top, P.hor, Math.pow(i / (n - 1), 1.5))));
  if (clear > 0.02) {
    g.globalAlpha = clear;
    const star = rgb(mixA([232, 239, 255], [242, 201, 220], kf)), dim = rgb(mixA([76, 92, 128], [91, 49, 82], kf));
    STARS.forEach((s, i) => { if (w.breeze > 0.5 && i % 2 === 0) return; R(s.x, s.y, 1, 1, Math.sin(t * s.sp + s.ph) > -0.3 ? star : dim); });
    const moon = rgb(mixA([241, 232, 200], [224, 90, 90], kf)), shade = rgb(mixA([214, 202, 162], [179, 68, 68], kf));
    for (let dy = -7; dy <= 7; dy++) { const hw = Math.round(Math.sqrt(49 - dy * dy)); R(296 - hw, 24 + dy, hw * 2, 1, moon); }
    R(293, 22, 2, 2, shade); R(298, 26, 2, 1, shade); R(295, 28, 1, 1, shade);
    g.globalAlpha = 1;
  }
  const cloudy = w.calm * 0.15 + w.breeze * 0.45 + w.storm + w.kraken * 0.75;
  if (w.storm > 0.02) { g.globalAlpha = w.storm; R(0, 0, W, 8, rgb(P.cloud)); g.globalAlpha = 1; }
  CLOUDS.forEach((c, i) => {
    const a = clamp(cloudy * 10 - i, 0, 1);
    if (a <= 0) return;
    const x = ((c.x + c.sp * t * (1 + w.storm * 1.2)) % (W + 100)) - 50;
    g.globalAlpha = a;
    R(x, c.y, c.w, 4, rgb(P.cloud)); R(x + 4, c.y - 2, c.w - 12, 2, rgb(P.cloud)); R(x + c.w * 0.3, c.y - 4, c.w * 0.3, 2, rgb(P.cloud)); R(x + 2, c.y + 4, c.w - 4, 1, rgb(P.cloudLo));
    g.globalAlpha = 1;
  });
  for (let x = 150; x < 216; x++) { const h = Math.round(7 * Math.sin(Math.PI * (x - 150) / 66)); if (h > 0) R(x, SURF - h, 1, h, rgb(P.isle)); }
  for (let x = 226; x < 262; x++) { const h = Math.round(4 * Math.sin(Math.PI * (x - 226) / 36)); if (h > 0) R(x, SURF - h, 1, h, rgb(P.isle)); }

  // lighthouse beam
  const LX = 356, LTOP = 50, LBASE = 104;
  // Light adds onto the sky instead of painting over it, so the beam reads warm rather than grey.
  { const cs = Math.cos(t * 0.7), len = Math.round(130 * Math.abs(cs)), dir = cs > 0 ? 1 : -1;
    g.globalCompositeOperation = 'lighter';
    if (len > 6) for (let d = 0; d < len; d += 2) { const half = 1 + d * 0.06, k = Math.pow(1 - d / len, 1.6) * Math.abs(cs); R(dir > 0 ? LX + 6 + d : LX - 8 - d, LTOP - 6 - half, 2, half * 2, rgb([95 * k, 80 * k, 38 * k])); }
    g.globalCompositeOperation = 'source-over'; }

  // water
  const water = rgb(P.water), waterHi = rgb(P.waterHi), foam = rgb(P.foam);
  for (let x = 0; x < W; x += 2) { const sy = surfY(x); R(x, sy, 2, SURF + 6 - sy, water); R(x, sy, 2, 1, Math.sin(x * 0.31 + t * 2.2) > 0.55 ? foam : waterHi); }
  for (let y = SURF + 6; y < H; y += 3) R(0, y, W, 3, waterAt(y));
  const shine = (w.calm + w.breeze) * (1 - kf);
  if (shine > 0.02) {
    g.globalAlpha = 0.45 * shine;
    for (let y = SURF + 2; y < SURF + 16; y += 2) if (Math.sin(t * 3 + y * 1.7) > -0.2) { const hw = Math.max(1, 6 - Math.round((y - SURF) * 0.3)); R(296 - hw + Math.round(Math.sin(t * 2 + y) * 2), y, hw * 2, 1, '#f1e8c8'); }
    g.globalAlpha = 0.05 * shine;
    for (let s = 0; s < 4; s++) { const sx = 120 + s * 52 + Math.sin(t * 0.3 + s) * 8; for (let y = SURF + 6; y < 192; y += 2) R(sx + (y - SURF) * 0.35, y, 6, 2, '#bfe6ff'); }
    g.globalAlpha = 1;
  }

  // seabed
  g.drawImage(bed, 0, 0);
  for (const s of WEEDS) { const by = seabedY(s.x); for (let i = 0; i < s.h; i++) R(s.x + Math.round(Math.sin(t * 1.3 + s.ph + i * 0.4) * i * 0.12), by - i, 1, 1, i % 3 ? '#2f6b4a' : '#3f8a5e'); }
  drawWreck(124, 1, 2);
  if (t >= SINK_AT + SINK_LEN) drawWreck(214, -1, 2);
  drawChest(t);
  if (kr > 0.02) {
    g.globalAlpha = kr;
    for (let dy = -8; dy <= 8; dy++) { const hw = Math.round(26 * Math.sqrt(1 - dy * dy / 64)); R(214 - hw, 184 + dy, hw * 2, 1, '#2a1436'); }
    const blink = Math.sin(t * 2.3) > 0.95;
    R(204, 182, 5, blink ? 1 : 3, '#ffd84a'); R(219, 182, 5, blink ? 1 : 3, '#ffd84a'); R(206, 183, 1, 1, '#120814'); R(221, 183, 1, 1, '#120814');
    g.globalAlpha = 1;
  }
  FISH.forEach(f => {
    const span = 218, p = (t * f.sp + f.off) % (span * 2), dir = p < span ? 1 : -1, x = 100 + (p < span ? p : span * 2 - p);
    R(x, f.y, 3, 2, f.col); R(dir > 0 ? x - 1 : x + 3, f.y + (Math.sin(t * 8 + f.y) > 0 ? 0 : 1), 1, 1, f.col); R(dir > 0 ? x + 2 : x, f.y, 1, 1, '#0a1322');
  });
  const bubble = (x0, y0, k, speed) => { const y = y0 - ((t * speed + k * 17) % (y0 - SURF - 6)); R(x0 + Math.sin(t * 4 + k) + (k % 5) - 2, y, 1, 1, '#9fd3ea'); };
  for (let k = 0; k < 5; k++) bubble(124, seabedY(124) - 6, k, 12);
  if (t >= SINK_AT + SINK_LEN) for (let k = 0; k < 6; k++) bubble(214, seabedY(214) - 6, k, 14);

  drawShore(P);
  drawTavern(t);
  drawLighthouse(P, LX, LTOP, LBASE);

  // ships, back row first, then the pier, then the front row
  const drawRow = row => {
    for (const s of SHIPS) {
      if (s.row !== row) continue;
      const { x, v } = shipX(s, t);
      let sinkY = 0;
      if (s.sink && t >= s.sink) { if (t >= s.sink + SINK_LEN) continue; sinkY = (seabedY(214) - SURF - 6) * easeInOut((t - s.sink) / SINK_LEN); }
      const wy = surfY(x) + (row === 1 ? 3 : -1) + Math.round(sinkY);
      const sails = !sinkY && (s.sea || (s.depart && t >= s.depart));
      const flag = s.mutiny && t >= s.mutiny ? BLACKFLAG : s.color;
      const bb = drawShip(g, x, wy, s.rk, s.color, v < 0 ? -1 : 1, sails, t + s.ph, flag);
      s.bb = bb; s.x = x;
      if (!sinkY) {
        const sp = SPEC[s.rk];
        R(x - sp.w / 2 - 2, wy, sp.w + 5, 2, wy < SURF + 6 ? water : waterAt(wy));
        if (v !== 0 && Math.abs(shipX(s, t + 0.05).x - x) > 0.05) { R(x - (sp.w / 2 + 4), wy, 3, 1, foam); R(x + sp.w / 2 + 2, wy, 2, 1, foam); }
      } else {
        for (let k = 0; k < 4; k++) R(x - 4 + k * 3, wy - 6 - ((t * 30 + k * 7) % 14), 1, 1, '#9fd3ea');
      }
    }
  };
  drawRow(0);
  drawPier(t);
  drawRow(1);

  if (kr > 0.02) {
    const top = SURF - 24, base = 190, full = base - top;
    [190, 240, 290].forEach((bx, i) => {
      const len = Math.round(full * kr * (0.75 + 0.25 * Math.sin(t * 0.9 + i)));
      for (let j = 0; j < len; j++) {
        const y = base - j, f = j / full, x = bx + Math.sin(t * 1.4 + i * 2 + j * 0.07) * (2 + f * 9), wd = Math.max(1, Math.round(6 - f * 5));
        R(x - wd / 2, y, wd, 1, y > SURF + 2 ? '#4d2a63' : '#7a3b8f');
        if (j % 5 === 0 && wd > 2) R(x - wd / 2, y, 1, 1, '#c58fd6');
      }
    });
  }
  const rain = w.storm + w.kraken * 0.6;
  if (rain > 0.02) {
    g.globalAlpha = 0.55 * rain;
    for (const d of RAIN) { const y = ((d.y + d.sp * t) % (SURF + 12)) - 10, x = ((d.x - d.sp * t * 0.3) % (W + 40) + W + 40) % (W + 40); R(x, y, 1, 3, '#9fb3c8'); }
    g.globalAlpha = 1;
  }
  for (const f of FLASHES) {
    const dt = t - f.at;
    if (dt < 0 || dt > 0.5) continue;
    if (dt < 0.12) for (const [x1, y1, x2, y2] of f.bolt) { const n2 = Math.ceil(Math.abs(y2 - y1)); for (let i = 0; i <= n2; i++) R(x1 + (x2 - x1) * i / n2, y1 + (y2 - y1) * i / n2, 1, 1, '#f4f7ff'); }
    g.globalAlpha = 0.32 * Math.exp(-dt * 6); R(0, 0, W, H, '#dfe8ff'); g.globalAlpha = 1;
  }
}
function drawShore(P) {
  for (let x = 0; x < 96; x++) {
    const top = x < 50 ? 106 : Math.round(106 + (x - 50) * 0.6), under = Math.max(top, SURF + 3);
    if (under > top) R(x, top, 1, under - top, rgb(P.rock));
    R(x, under, 1, H - under, rgb(P.rockDeep)); R(x, top, 1, 1, rgb(P.grass));
    if (x % 9 === 0) R(x, top + 3, 1, 1, rgb(P.rockHi));
  }
}
function drawTavern(t) {
  const x = 8, y = 86;
  for (let i = 0; i < 5; i++) { const py = 74 - ((t * 6 + i * 5) % 22); g.globalAlpha = 0.35 * (py - 52) / 22; R(x + 23 + Math.sin(t + i) * 1.5 + (74 - py) * 0.2, py, 2, 2, '#9aa6ba'); }
  g.globalAlpha = 1;
  R(x + 22, y - 12, 3, 6, '#5a5047'); R(x, y, 30, 20, '#4a3426');
  for (let i = 0; i < 20; i += 3) R(x, y + i, 30, 1, '#3e2b1f');
  for (let i = 0; i < 8; i++) R(x - 2 + i, y - 1 - i, 34 - 2 * i, 1, i % 2 ? '#7a2f2a' : '#6a2824');
  const win = Math.sin(t * 9) > 0.6 ? '#ffd27a' : '#ffc35a';
  R(x + 4, y + 6, 5, 4, win); R(x + 21, y + 6, 5, 4, win); R(x + 6, y + 6, 1, 4, '#4a3426'); R(x + 23, y + 6, 1, 4, '#4a3426');
  R(x + 12, y + 11, 6, 9, '#2a1c14'); R(x + 13, y + 12, 4, 8, '#3a2618'); R(x + 16, y + 16, 1, 1, '#e7b75a');
  R(x + 30, y + 3, 7, 1, '#3b2a1c'); R(x + 31, y + 4, 5, 4, '#e7b75a'); R(x + 32, y + 5, 3, 2, '#6b4a2f');
  R(41, 97, 10, 9, '#3d2c22'); for (let i = 0; i < 4; i++) R(40 + i, 96 - i, 12 - 2 * i, 1, '#5a3a2c'); R(44, 100, 3, 2, '#ffc35a');
}
function drawLighthouse(P, LX, LTOP, LBASE) {
  for (let y = 100; y < H; y++) {
    const above = y <= SURF + 2, half = above ? 12 + (y - 100) : 34 + Math.round(Math.sin(y * 0.4) * 1.5);
    R(LX - half, y, half * 2, 1, rgb(above ? (y < 103 ? P.rockHi : P.rock) : P.rockDeep));
  }
  for (let y = LTOP; y < LBASE; y++) {
    const f = (y - LTOP) / (LBASE - LTOP), half = Math.round(5 + f * 3), stripe = Math.floor((y - LTOP) / 8) % 2 === 0;
    R(LX - half, y, half * 2, 1, stripe ? '#e3dccb' : '#b8443a'); R(LX + half - 2, y, 2, 1, stripe ? '#bfb7a5' : '#8e3129');
  }
  R(LX - 2, LBASE - 7, 4, 7, '#2a1c14'); R(LX - 8, LTOP - 2, 16, 2, '#2a2f38');
  R(LX - 5, LTOP - 9, 10, 7, '#ffd98a'); R(LX - 5, LTOP - 9, 1, 7, '#2a2f38'); R(LX + 4, LTOP - 9, 1, 7, '#2a2f38'); R(LX - 1, LTOP - 9, 1, 7, '#2a2f38');
  R(LX - 6, LTOP - 11, 12, 2, '#7d2a24'); R(LX - 4, LTOP - 13, 8, 2, '#7d2a24'); R(LX - 1, LTOP - 15, 2, 2, '#2a2f38');
}
function drawPier(t) {
  const y = 112;
  for (let x = 62; x <= 172; x += 12) { R(x, y + 2, 2, SURF + 2 - (y + 2), '#3b2a1c'); R(x, SURF + 2, 2, 10, '#241a12'); }
  R(58, y, 118, 2, '#7a5636'); R(58, y, 118, 1, '#9a7148');
  for (let x = 60; x < 176; x += 4) R(x, y + 1, 1, 1, '#5c3f27');
  for (const lx of [72, 124, 174]) {
    R(lx, y - 6, 1, 6, '#3b2a1c');
    g.globalCompositeOperation = 'lighter';
    R(lx - 3, y - 10, 7, 6, '#1c1306'); R(lx - 2, y - 9, 5, 4, '#2a1c08');
    g.globalCompositeOperation = 'source-over';
    R(lx - 1, y - 8, 3, 2, Math.sin(t * 5 + lx) > -0.8 ? '#ffc35a' : '#c9922f');
  }
}
function drawWreck(x, tilt, rk) {
  const s = SPEC[rk], by = seabedY(x) + 1, hh = 4, half = Math.round(s.w / 2);
  for (let r = 0; r < hh; r++) { const ins = Math.max(0, r - 1), shift = Math.round((hh - r) * 0.8 * tilt); R(x - half + ins + shift, by - hh + r, s.w - ins * 2, 1, r === 0 ? '#4a4238' : '#38322b'); }
  R(x - 2, by - 3, 2, 1, '#1a1712'); R(x + 4, by - 2, 1, 1, '#1a1712');
  for (let i = 0; i < 10; i++) R(x + Math.round(i * 0.7 * tilt) + 2 * tilt, by - hh - i, 1, 1, '#4a4038');
  R(x + Math.round(5 * 0.7 * tilt) + 3 * tilt, by - hh - 7, 3, 3, '#6d6a5e');
  R(x - half + 3, by - hh, 1, 1, '#3f8a5e'); R(x + half - 4, by - hh + 1, 1, 1, '#3f8a5e');
}
function drawChest(t) {
  const x = 300, by = seabedY(306), y = by - 7;
  for (let i = 0; i < 9; i++) R(x - 4 + ((i * 7) % 20), by - 1 - ((i * 3) % 3), 2, 1, i % 2 ? '#e7b75a' : '#c99a3f');
  R(x, y, 12, 7, '#5a3b1e'); R(x, y, 12, 2, '#7a5228'); R(x, y + 2, 12, 1, '#e7b75a'); R(x + 5, y + 3, 2, 2, '#e7b75a'); R(x, y, 1, 7, '#3e2814'); R(x + 11, y, 1, 7, '#3e2814');
  for (let i = 0; i < 4; i++) { g.globalAlpha = 0.5; R(x + 6 + Math.cos(t * 2 + i) * 6, y - 2 - ((t * 10 + i * 7) % 12), 1, 1, '#ffe7a6'); }
  g.globalAlpha = 1;
}

/* ---------------- overlays at full resolution ---------------- */
const C = { ink: '#0a1322', panel: 'rgba(9,16,29,0.93)', rope: '#24385a', sail: '#ece6d6', mist: '#c3cbd8', fog: '#8a9ab3', flare: '#ff8a5b', brass: '#e7b75a', sky: '#7fb6ff', gain: '#4fdc9b', loss: '#ff5470' };
const F = { px: n => `700 ${n}px "Pixelify Sans", monospace`, body: (n, wgt = 600) => `${wgt} ${n}px "Figtree", sans-serif`, it: n => `italic 500 ${n}px "Figtree", sans-serif`, mono: (n, wgt = 700) => `${wgt} ${n}px "JetBrains Mono", monospace` };
function txt(s, x, y, font, color, opt = {}) {
  dc.save();
  dc.font = font; dc.textAlign = opt.align || 'left'; dc.textBaseline = 'alphabetic';
  dc.globalAlpha = opt.alpha == null ? 1 : opt.alpha;
  if (opt.spacing) dc.letterSpacing = opt.spacing + 'px';
  if (opt.stroke !== false) { dc.lineJoin = 'round'; dc.lineWidth = opt.lw || Math.max(6, parseInt(font.match(/(\d+)px/)[1], 10) * 0.16); dc.strokeStyle = 'rgba(5,9,18,0.92)'; dc.strokeText(s, x, y); }
  dc.fillStyle = color; dc.fillText(s, x, y);
  dc.restore();
}
function fitFont(s, maker, size, maxW) { dc.font = maker(size); const w = dc.measureText(s).width; return w > maxW ? maker(Math.floor(size * maxW / w)) : maker(size); }
function panel(x, y, w, h, alpha, pointerX) {
  dc.save(); dc.globalAlpha = alpha;
  dc.beginPath(); dc.roundRect(x, y, w, h, 12);
  if (pointerX != null) { dc.moveTo(pointerX - 16, y + h); dc.lineTo(pointerX, y + h + 18); dc.lineTo(pointerX + 16, y + h); }
  dc.fillStyle = C.panel; dc.fill(); dc.lineWidth = 3; dc.strokeStyle = C.rope; dc.stroke();
  dc.restore();
}
function pill(s, x, y, color, alpha) {
  dc.save(); dc.globalAlpha = alpha; dc.font = F.mono(22); const w = dc.measureText(s).width + 20;
  dc.lineWidth = 2; dc.strokeStyle = color; dc.beginPath(); dc.roundRect(x, y - 24, w, 32, 5); dc.stroke();
  dc.fillStyle = color; dc.fillText(s, x + 10, y); dc.restore(); return w;
}
const GLYPH = {
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
};
function logo(cx, y, px, alpha) {
  const word = 'COVE', width = (word.length * 6 - 1) * px, x0 = Math.round(cx - width / 2);
  dc.save(); dc.globalAlpha = alpha;
  [...word].forEach((ch, i) => GLYPH[ch].forEach((row, ry) => [...row].forEach((bit, rx) => {
    if (bit !== '1') return;
    const x = x0 + (i * 6 + rx) * px, yy = y + ry * px;
    dc.fillStyle = 'rgba(5,9,18,0.9)'; dc.fillRect(x + px * 0.22, yy + px * 0.22, px, px);
    dc.fillStyle = i === 2 ? C.flare : C.sail; dc.fillRect(x, yy, px, px);
  })));
  dc.restore();
}
const fade = (t, t0, t1, fin = 0.35, fout = 0.3) => Math.min(smooth(t0, t0 + fin, t), 1 - smooth(t1 - fout, t1, t));
const shipPx = sym => { const s = SHIPS.find(x => x.sym === sym); return { x: s.x * SCALE, top: s.bb ? s.bb.y * SCALE : 480 }; };

const BEATS = [
  { t0: 2.55, t1: 5.0, kicker: 'THE CAPTAINS', title: 'Every ship is an AI captain.', sub: 'It trades real Solana memecoins and explains every move.' },
  { t0: 5.0, t1: 6.3, kicker: 'THE SEA IS THE MARKET', title: 'Coins bleed, the storm rolls in.', sub: 'Captains see the weather and trade smaller.' },
  { t0: 6.3, t1: 7.65, kicker: 'THE SEA IS THE MARKET', title: 'Crash the board, wake the kraken.', sub: 'Most captains stop buying until it dives.' },
  { t0: 7.65, t1: 10.0, kicker: 'MUTINY', title: 'Bleed too much and the crew revolts.', sub: 'Everyone in the harbor gets a vote.' },
  { t0: 10.0, t1: 12.4, kicker: 'WRECKS STAY', title: 'Lose 90% and you sink.', sub: 'Your last words stay on the seabed.' },
];
function drawOverlay(t) {
  // 1. Title card, visible from the first frame so the thumbnail carries the name.
  if (t < 2.7) {
    const a = 1 - smooth(2.15, 2.55, t);
    txt('LIVE ON SOLANA', OW / 2, 132, F.mono(30), C.brass, { align: 'center', alpha: a, spacing: 6, lw: 6 });
    logo(OW / 2, 168, 26, a);
    txt('AI captains that trade for you.', OW / 2, 440, F.px(68), C.sail, { align: 'center', alpha: a });
  }
  // 2-5. Captions, top left over the sky.
  for (const b of BEATS) {
    const a = fade(t, b.t0, b.t1, 0.3, 0.25);
    if (a <= 0) continue;
    const rise = (1 - easeOut((t - b.t0) / 0.4)) * 24;
    txt(b.kicker, 96, 118 + rise, F.mono(28), b.kicker === 'MUTINY' ? C.loss : C.brass, { alpha: a, spacing: 5, lw: 6 });
    txt(b.title, 96, 196 + rise, fitFont(b.title, F.px, 78, 1260), C.sail, { alpha: a });
    txt(b.sub, 98, 250 + rise, F.body(36), C.mist, { alpha: a, lw: 7 });
  }
  // The first trade, pinned to the galleon.
  { const a = fade(t, 3.0, 5.0, 0.25, 0.3);
    if (a > 0) {
      const s = shipPx('GULLBEARD'), w = 680, h = 150, x = clamp(s.x - w / 2, 40, OW - w - 40), y = s.top - h - 34;
      const pop = 0.9 + 0.1 * easeOut((t - 3.0) / 0.25);
      dc.save(); dc.translate(s.x, y + h); dc.scale(pop, pop); dc.translate(-s.x, -(y + h));
      panel(x, y, w, h, a, s.x);
      dc.save(); dc.globalAlpha = a; dc.fillStyle = C.flare; dc.fillRect(x + 24, y + 30, 22, 15); dc.restore();
      txt('$GULLBEARD', x + 58, y + 46, F.px(34), C.flare, { alpha: a, stroke: false });
      pill('BOUGHT', x + 290, y + 45, C.sky, a);
      txt('now', x + w - 24, y + 45, F.mono(22, 500), C.fog, { alpha: a, align: 'right', stroke: false });
      const full = 'Hoisting sail on $GOMO: +63.8% this hour on $1.07M volume. 0.48 SOL in, out at +20%.';
      const shown = full.slice(0, Math.floor(full.length * clamp((t - 3.2) / 0.9, 0, 1)));
      wrapText(shown, x + 24, y + 88, w - 48, 34, F.body(27, 500), C.mist, a);
      dc.restore();
    } }
  // The board readout during the storm.
  { const a = fade(t, 5.05, 7.65, 0.3, 0.3);
    if (a > 0) {
      const v = lerp(-7.4, -12.9, easeOut((t - 6.3) / 0.5));
      panel(1548, 52, 332, 112, a);
      txt('BOARD · LAST HOUR', 1574, 92, F.mono(20, 500), C.fog, { alpha: a, stroke: false, spacing: 2 });
      txt((v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + '%', 1574, 146, F.mono(40), C.loss, { alpha: a, stroke: false });
      txt(t < 6.3 ? 'STORM' : 'KRAKEN', 1856, 144, F.px(26), t < 6.3 ? C.brass : '#c58fd6', { alpha: a, stroke: false, align: 'right' });
    } }
  // The mutiny vote over PEGLEG.
  { const a = fade(t, 8.0, 10.0, 0.25, 0.3);
    if (a > 0) {
      const s = shipPx('PEGLEG'), w = 620, h = 214, x = clamp(s.x - w / 2, 40, OW - w - 40), y = s.top - h - 34;
      panel(x, y, w, h, a, s.x);
      txt('MUTINY ABOARD $PEGLEG', x + 26, y + 50, F.px(34), C.loss, { alpha: a, stroke: false });
      txt('−34.2% since launch · line −30%', x + 26, y + 88, F.mono(22, 500), C.fog, { alpha: a, stroke: false });
      const f = easeOut((t - 8.3) / 1.0);
      const bar = (label, pct, yy, color) => {
        txt(label, x + 26, yy, F.body(24), C.sail, { alpha: a, stroke: false });
        txt(Math.round(pct * f) + '%', x + w - 26, yy, F.mono(24), C.sail, { alpha: a, stroke: false, align: 'right' });
        dc.save(); dc.globalAlpha = a; dc.fillStyle = '#15243a'; dc.fillRect(x + 26, yy + 10, w - 52, 12); dc.fillStyle = color; dc.fillRect(x + 26, yy + 10, (w - 52) * pct / 100 * f, 12); dc.restore();
      };
      bar('Drop anchor', 61, y + 132, C.loss);
      bar('Keep sailing', 39, y + 184, C.sky);
    } }
  // The epitaph over the new wreck.
  { const a = fade(t, 11.45, 12.4, 0.25, 0.3);
    if (a > 0) {
      const wx = 214 * SCALE, w = 620, h = 128, x = wx - w / 2, y = (seabedY(214) - 12) * SCALE - h - 24;
      panel(x, y, w, h, a, wx);
      txt('† $PEGLEG', x + 26, y + 48, F.px(34), '#a8b0c0', { alpha: a, stroke: false });
      pill('SANK −91%', x + 230, y + 46, C.loss, a);
      txt('“Only a dip. Holding all 3 slots.”', x + 26, y + 98, F.it(30), C.mist, { alpha: a, stroke: false });
    } }
  // Address in the corner while the story plays.
  { const a = fade(t, 2.7, 12.4, 0.4, 0.3) * 0.8; if (a > 0) txt('covecaptains.vercel.app', OW - 40, OH - 34, F.mono(26, 500), C.sail, { align: 'right', alpha: a, lw: 6 }); }
  // 6. End card.
  if (t >= 12.3) {
    dc.save(); dc.globalAlpha = 0.66 * smooth(12.3, 12.8, t); dc.fillStyle = '#060c18'; dc.fillRect(0, 0, OW, OH); dc.restore();
    const step = (t0, d = 0.4) => easeOut((t - t0) / d);
    const a1 = step(12.45), a2 = step(12.75), a3 = step(13.05), a4 = step(13.35);
    logo(OW / 2, 190 - (1 - a1) * 30, 28, a1);
    txt('AI captains that trade for you.', OW / 2, 512 - (1 - a2) * 20, F.px(66), C.sail, { align: 'center', alpha: a2 });
    if (a3 > 0) {
      dc.save(); dc.globalAlpha = a3; dc.font = F.mono(44); const label = 'covecaptains.vercel.app', w = dc.measureText(label).width + 72, x = OW / 2 - w / 2, y = 572 - (1 - a3) * 16;
      dc.fillStyle = C.flare; dc.beginPath(); dc.roundRect(x, y, w, 88, 12); dc.fill();
      dc.fillStyle = '#b8532d'; dc.fillRect(x + 12, y + 88, w - 24, 8);
      dc.fillStyle = '#2a1206'; dc.textAlign = 'center'; dc.fillText(label, OW / 2, y + 60); dc.restore();
    }
    txt('Launch a captain. Bring your friends.', OW / 2, 746 - (1 - a4) * 14, F.body(38), C.mist, { align: 'center', alpha: a4, lw: 7 });
  }
}
function wrapText(s, x, y, maxW, lh, font, color, alpha) {
  dc.save(); dc.font = font; dc.fillStyle = color; dc.globalAlpha = alpha;
  let line = '', yy = y;
  for (const word of s.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (dc.measureText(test).width > maxW && line) { dc.fillText(line, x, yy); line = word; yy += lh; } else line = test;
  }
  if (line) dc.fillText(line, x, yy);
  dc.restore();
}

/* ---------------- one frame ---------------- */
function drawFrame(t) {
  drawScene(t);
  dc.imageSmoothingEnabled = false;
  dc.drawImage(off, 0, 0, OW, OH);
  drawOverlay(t);
}

/* ---------------- encode ---------------- */
const status = s => { document.getElementById('status').textContent = s; };
async function render() {
  const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: OW, height: OH, frameRate: FPS }, fastStart: 'in-memory' });
  let failure = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
  enc.configure({ codec: 'avc1.640028', width: OW, height: OH, bitrate: 8_000_000, framerate: FPS, avc: { format: 'avc' } });
  const N = DUR * FPS;
  for (let i = 0; i < N; i++) {
    if (failure) throw failure;
    drawFrame(i / FPS);
    const frame = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();
    if (enc.encodeQueueSize > 6) await new Promise(r => enc.addEventListener('dequeue', r, { once: true }));
    if (i % 15 === 0) { status(`Encoding frame ${i} of ${N}`); await new Promise(r => setTimeout(r, 0)); }
  }
  await enc.flush();
  if (failure) throw failure;
  muxer.finalize();
  const buf = muxer.target.buffer;
  status('Saving…');
  const res = await fetch('/save?name=cove-promo.mp4', { method: 'POST', body: buf });
  const out = await res.json();
  status(`Saved ${out.saved}, ${(out.bytes / 1048576).toFixed(2)} MB`);
  return out;
}

/* ---------------- studio controls ---------------- */
const scrub = document.getElementById('scrub'), timeEl = document.getElementById('time');
let playing = false, startAt = 0;
const show = t => { drawFrame(t); scrub.value = t; timeEl.textContent = t.toFixed(2) + 's'; };
scrub.addEventListener('input', () => { playing = false; show(+scrub.value); });
document.getElementById('play').addEventListener('click', () => {
  playing = !playing; startAt = performance.now() - (+scrub.value % DUR) * 1000;
  const loop = now => { if (!playing) return; show(((now - startAt) / 1000) % DUR); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
document.getElementById('render').addEventListener('click', async e => {
  e.target.disabled = true;
  try { await render(); } catch (err) { status('Render failed: ' + err.message); }
  e.target.disabled = false;
});
const ready = Promise.all([
  document.fonts.load(F.px(78)), document.fonts.load(F.body(36)), document.fonts.load(F.body(27, 500)), document.fonts.load(F.it(30)), document.fonts.load(F.mono(44)), document.fonts.load(F.mono(22, 500)),
]).then(() => { status('Ready'); show(0); });
window.promo = { draw: show, render, ready, duration: DUR };
})();
