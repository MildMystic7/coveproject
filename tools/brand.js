// Renders the X profile images, the link-preview card and the favicons from the site's own pixel sprites.
// Run from the repo root: node tools/brand.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
require('../assets/sprites.js');
const { drawShip, mix } = globalThis.CoveSprites;

const ROOT = path.join(__dirname, '..');

/* ---------- a tiny RGB canvas with the fillRect API the sprites use ---------- */
function parseColor(s) {
  if (s[0] === '#') { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  return s.match(/\d+/g).slice(0, 3).map(Number);
}
function makeImage(w, h) {
  const px = new Uint8Array(w * h * 3);
  const ctx = {
    fillStyle: '#000000', globalAlpha: 1,
    fillRect(x, y, ww, hh) {
      const [r, g, b] = parseColor(this.fillStyle), a = this.globalAlpha;
      const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(w, x + ww), y1 = Math.min(h, y + hh);
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * w + xx) * 3;
        px[i] = Math.round(px[i] * (1 - a) + r * a); px[i + 1] = Math.round(px[i + 1] * (1 - a) + g * a); px[i + 2] = Math.round(px[i + 2] * (1 - a) + b * a);
      }
    },
  };
  const R = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh)); };
  return { w, h, px, ctx, R };
}

/* ---------- PNG encoder (RGB, nearest-neighbour upscale) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePNG(img, scale, file) {
  const W = img.w * scale, H = img.h * scale, stride = W * 3 + 1;
  const raw = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < W; x++) {
      const si = (sy * img.w + Math.floor(x / scale)) * 3, di = y * stride + 1 + x * 3;
      raw[di] = img.px[si]; raw[di + 1] = img.px[si + 1]; raw[di + 2] = img.px[si + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const out = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  console.log(`${path.relative(ROOT, file)}  ${W}x${H}  ${(out.length / 1024).toFixed(1)} KB`);
}

/* ---------- 5x7 pixel font ---------- */
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'], K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'], M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'], Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'], ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
function text(img, str, x, y, s, col, colorAt) {
  [...str].forEach((ch, i) => {
    const g = FONT[ch] || FONT[' '];
    const c = colorAt ? colorAt(i) || col : col;
    g.forEach((row, ry) => [...row].forEach((bit, rx) => {
      if (bit !== '1') return;
      img.R(x + (i * 6 + rx) * s + Math.max(1, s / 4), y + ry * s + Math.max(1, s / 4), s, s, '#050912');
      img.R(x + (i * 6 + rx) * s, y + ry * s, s, s, c);
    }));
  });
}
const textWidth = (str, s) => (str.length * 6 - 1) * s;

/* ---------- scene pieces ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function sky(img, surf, seed, density) {
  for (let y = 0; y < surf + 4; y += 2) img.R(0, y, img.w, 2, mix('#060f24', '#1d3b6e', Math.pow(y / (surf + 4), 1.5)));
  const r = rng(seed);
  for (let i = 0; i < img.w * surf * density; i++) img.R(Math.floor(r() * img.w), Math.floor(r() * (surf - 8)), 1, 1, r() > 0.35 ? '#e8efff' : '#4c5c80');
}
function moon(img, cx, cy, rad) {
  for (let dy = -rad; dy <= rad; dy++) { const hw = Math.round(Math.sqrt(rad * rad - dy * dy)); img.R(cx - hw, cy + dy, hw * 2, 1, '#f1e8c8'); }
  img.R(cx - Math.round(rad * 0.4), cy - Math.round(rad * 0.3), Math.ceil(rad / 4), Math.ceil(rad / 4), '#d6caa2');
  img.R(cx + Math.round(rad * 0.3), cy + Math.round(rad * 0.25), Math.ceil(rad / 4), Math.ceil(rad / 5), '#d6caa2');
}
function sea(img, surf) {
  for (let y = surf; y < img.h; y += 2) img.R(0, y, img.w, 2, mix('#16496f', '#030c18', Math.pow((y - surf) / (img.h - surf), 0.8)));
  for (let x = 0; x < img.w; x += 2) img.R(x, surf, 2, 1, Math.sin(x * 0.31) > 0.55 ? '#9ad6f0' : '#2a6a93');
}
function reflection(img, cx, surf) {
  img.ctx.globalAlpha = 0.45;
  for (let y = surf + 2; y < surf + 16; y += 2) { const hw = Math.max(1, 7 - Math.round((y - surf) * 0.35)); img.R(cx - hw + ((y * 7) % 3) - 1, y, hw * 2, 1, '#f1e8c8'); }
  img.ctx.globalAlpha = 1;
}
function isle(img, x0, x1, h, surf) { for (let x = x0; x < x1; x++) { const hh = Math.round(h * Math.sin(Math.PI * (x - x0) / (x1 - x0))); if (hh > 0) img.R(x, surf - hh, 1, hh, '#10244a'); } }
function lighthouse(img, x, base, top) {
  for (let y = base - 4; y < base + 6; y++) { const half = 8 + (y - base + 4); img.R(x - half, y, half * 2, 1, y < base - 2 ? '#34444a' : '#1d2632'); }
  for (let y = top; y < base - 2; y++) {
    const f = (y - top) / (base - 2 - top), half = Math.round(4 + f * 3), stripe = Math.floor((y - top) / 6) % 2 === 0;
    img.R(x - half, y, half * 2, 1, stripe ? '#e3dccb' : '#b8443a');
    img.R(x + half - 2, y, 2, 1, stripe ? '#bfb7a5' : '#8e3129');
  }
  img.R(x - 6, top - 2, 12, 2, '#2a2f38');
  img.R(x - 4, top - 8, 8, 6, '#ffd98a'); img.R(x - 4, top - 8, 1, 6, '#2a2f38'); img.R(x + 3, top - 8, 1, 6, '#2a2f38');
  img.R(x - 5, top - 10, 10, 2, '#7d2a24'); img.R(x - 3, top - 12, 6, 2, '#7d2a24');
  const len = 70;
  for (let d = 0; d < len; d += 2) {
    const half = 1 + d * 0.06;
    img.ctx.globalAlpha = 0.6 * Math.pow(1 - d / len, 1.8);
    img.R(x - 6 - d, top - 5 - half, 2, half * 2, '#ffe7a6');
  }
  img.ctx.globalAlpha = 1;
}
function ship(img, x, surf, rk, col, dir = 1) {
  drawShip(img.ctx, x, surf + 1, rk, col, dir, true, 1.3, col);
  const half = [5, 8, 11, 14, 18][rk];
  img.R(x - half - 2, surf + 1, half * 2 + 5, 2, '#16496f');
}
const C = { sail: '#ece6d6', flare: '#ff8a5b', fog: '#8d9db5', mist: '#c3cbd8', brass: '#e7b75a' };

/* ---------- X avatar: 400x400 ---------- */
{
  const img = makeImage(80, 80), surf = 58;
  sky(img, surf, 7, 0.012);
  moon(img, 57, 21, 10);
  sea(img, surf);
  reflection(img, 57, surf);
  ship(img, 38, surf, 4, C.flare);
  writePNG(img, 5, path.join(ROOT, 'brand', 'x-avatar.png'));
}

/* ---------- X banner: 1500x500 ---------- */
{
  const img = makeImage(300, 100), surf = 74;
  sky(img, surf, 11, 0.01);
  moon(img, 214, 20, 8);
  isle(img, 150, 196, 5, surf); isle(img, 206, 236, 3, surf);
  sea(img, surf);
  reflection(img, 214, surf);
  lighthouse(img, 282, surf, 36);
  ship(img, 128, surf, 0, '#ffd166');
  ship(img, 150, surf, 2, '#5fd0ff');
  ship(img, 182, surf, 3, '#c08bff', -1);
  ship(img, 222, surf, 4, C.flare);
  ship(img, 254, surf, 1, '#4fdc9b', -1);
  text(img, 'COVE', 16, 12, 4, C.sail, i => i === 2 ? C.flare : null);
  text(img, 'AI CAPTAINS THAT', 17, 46, 1, C.mist);
  text(img, 'TRADE FOR YOU', 17, 55, 1, C.mist);
  writePNG(img, 5, path.join(ROOT, 'brand', 'x-banner.png'));
}

/* ---------- link preview card: 1200x630 ---------- */
{
  const img = makeImage(240, 126), surf = 96;
  sky(img, surf, 23, 0.01);
  moon(img, 178, 22, 9);
  isle(img, 120, 170, 5, surf);
  sea(img, surf);
  reflection(img, 178, surf);
  lighthouse(img, 222, surf, 52);
  ship(img, 112, surf, 1, '#4fdc9b');
  ship(img, 140, surf, 3, '#5fd0ff', -1);
  ship(img, 178, surf, 4, C.flare);
  text(img, 'COVE', 16, 16, 4, C.sail, i => i === 2 ? C.flare : null);
  text(img, 'AI CAPTAINS THAT', 17, 54, 1, C.mist);
  text(img, 'TRADE FOR YOU', 17, 63, 1, C.mist);
  text(img, 'LIVE DEMO', 17, 78, 1, C.brass);
  writePNG(img, 5, path.join(ROOT, 'og.png'));
}

/* ---------- favicons ---------- */
{
  const img = makeImage(32, 32), surf = 24;
  sky(img, surf, 3, 0.01);
  moon(img, 23, 9, 5);
  sea(img, surf);
  ship(img, 14, surf, 1, C.flare);
  writePNG(img, 1, path.join(ROOT, 'favicon.png'));
}
{
  const img = makeImage(36, 36), surf = 27;
  sky(img, surf, 5, 0.01);
  moon(img, 26, 10, 6);
  sea(img, surf);
  ship(img, 16, surf, 1, C.flare);
  writePNG(img, 5, path.join(ROOT, 'apple-touch-icon.png'));
}
