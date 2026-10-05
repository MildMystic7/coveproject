/* Shared pixel sprites for COVE. Loaded by the site (window.CoveSprites) and by tools/brand.js in Node. */
(function (root) {
  'use strict';

  function rr(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };

  // Ship sizes by rank: Raft, Sloop, Brig, Frigate, Galleon.
  const SPEC = [
    { w: 10, hh: 3, masts: 1, mh: 9, sw: 5 },
    { w: 16, hh: 4, masts: 1, mh: 12, sw: 7 },
    { w: 22, hh: 5, masts: 2, mh: 14, sw: 7 },
    { w: 28, hh: 6, masts: 2, mh: 17, sw: 9 },
    { w: 36, hh: 7, masts: 3, mh: 21, sw: 10 },
  ];
  const SAIL = '#ece6d6', SAIL2 = '#c9c2ae', WOOD = '#5b3a22', WOOD2 = '#46301d', DARK = '#3b2a1c', BLACKFLAG = '#111111';

  function sailRect(P, lx, y, w, h) {
    const l = lx - Math.floor(w / 2);
    P(l - 1, y - 1, w + 2, 1, DARK);
    for (let r = 0; r < h; r++) {
      const belly = (r > 0 && r < h - 1) ? 1 : 0;
      P(l, y + r, w + belly, 1, SAIL);
      P(l, y + r, 1, 1, SAIL2);
    }
  }

  // Draws a ship centered on cx with its waterline at wy. Returns its bounding box.
  function drawShip(c, cx, wy, rk, col, dir, sailsUp, t, flagCol) {
    const s = SPEC[rk], half = Math.floor(s.w / 2), deckY = wy - s.hh + 2;
    cx = Math.round(cx);
    const P = (lx, y, w, h, color) => rr(c, dir > 0 ? cx + lx : cx - lx - w, y, w, h, color);
    if (rk === 0) {
      P(-half, deckY, s.w, 2, '#7a5a36');
      for (let i = -half + 3; i < half; i += 3) P(i, deckY, 1, 2, '#5b4128');
      P(-half, deckY + 2, s.w, 1, '#4a3420');
    } else {
      for (let r = 0; r < s.hh; r++) {
        const ins = Math.max(0, r - 1);
        P(-half + ins, deckY + r, s.w - ins * 2, 1, r === 0 ? col : (r === 2 ? WOOD2 : WOOD));
      }
      P(half - 2, deckY - 1, 3, 1, col); P(half, deckY - 2, 2, 1, WOOD); P(-half, deckY - 1, 2, 1, WOOD);
      P(half + 1, deckY - 2, 3, 1, DARK);
      if (rk >= 3) {
        for (let gx = -half + 5; gx < half - 4; gx += 4) P(gx, deckY + 2, 2, 1, '#140d08');
        const cw = rk === 4 ? 9 : 7, ch = rk === 4 ? 5 : 4;
        P(-half, deckY - ch, cw, ch, WOOD); P(-half, deckY - ch, cw, 1, col);
        P(-half + 2, deckY - ch + 2, 1, 1, '#ffc35a'); P(-half + 5, deckY - ch + 2, 1, 1, '#ffc35a');
      }
    }
    let mainLx = 0, frontLx = -99, mainH = s.mh;
    for (let m = 0; m < s.masts; m++) {
      const lx = s.masts === 1 ? (rk === 0 ? 0 : -1) : Math.round(-s.w * 0.28 + m * (s.w * 0.56 / (s.masts - 1)));
      const isMain = s.masts === 1 || m === Math.floor(s.masts / 2);
      const h = isMain ? s.mh : s.mh - 3;
      if (isMain) { mainLx = lx; mainH = h; }
      if (lx > frontLx) frontLx = lx;
      P(lx, deckY - h, 1, h, DARK);
      const lowH = Math.max(3, Math.round(h * 0.36)), upH = Math.max(2, Math.round(h * 0.27));
      const lw = s.sw, uw = s.sw - 2, ly = deckY - 2 - lowH, uy = ly - 1 - upH;
      if (sailsUp) {
        sailRect(P, lx, ly, lw, lowH);
        if (rk > 0) sailRect(P, lx, uy, uw, upH);
        if (rk >= 2) P(lx - 1, ly + Math.floor(lowH / 2) - 1, 3, 2, col);
      } else {
        P(lx - Math.floor(lw / 2), ly, lw, 1, '#d8d0bc');
        if (rk > 0) P(lx - Math.floor(uw / 2), uy, uw, 1, '#d8d0bc');
      }
    }
    if (sailsUp && rk >= 1) {
      const n = Math.round(s.mh * 0.45), top = deckY - 2 - n;
      for (let i = 0; i < n; i++) P(frontLx + 2, top + i, Math.max(1, Math.floor(i * 0.55)), 1, i % 3 === 0 ? SAIL2 : SAIL);
    }
    const fy = deckY - mainH, fw = rk >= 2 ? 5 : 4, fh = rk >= 2 ? 3 : 2;
    for (let i = 0; i < fw; i++) P(mainLx - 1 - i, fy + (Math.sin(t * 7 + i * 0.9) > 0.2 ? 1 : 0), 1, fh, flagCol);
    if (flagCol === BLACKFLAG) P(mainLx - 3, fy + 1, 1, 1, SAIL);
    P(-half + 1, deckY - 2, 1, 1, Math.sin(t * 3) > -0.5 ? '#ffc35a' : '#9a6a2a');
    return { x: cx - half - 3, y: fy - 2, w: s.w + 6, h: wy - fy + 3 };
  }

  // A ship on a small strip of night sea, for cards and the rank ladder.
  function drawMini(canvas, rk, col, sailsUp) {
    const c = canvas.getContext('2d');
    rr(c, 0, 0, canvas.width, canvas.height, '#0b1730');
    const wy = canvas.height - 5;
    drawShip(c, canvas.width / 2, wy, rk, col, 1, sailsUp !== false, 0, col);
    rr(c, 0, wy, canvas.width, canvas.height - wy, '#16496f');
    for (let x = 0; x < canvas.width; x += 4) rr(c, x, wy, 2, 1, '#2a6a93');
  }

  // Bartolo, the harbormaster. 16x16, one char per pixel.
  const FACE = [
    '................',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HHHBBHHH....',
    '..KKKKKKKKKKKK..',
    '...SSSSSSSSSS...',
    '...SSEESSEESS...',
    '...SSSSSSSSSS...',
    '..SSSSSNNSSSSS..',
    '..GGSSSSSSSSGG..',
    '..GGGGMMMMGGGG..',
    '..GGGGGGGGGGPPP.',
    '...GGGGGGGGG.PP.',
    '....GGGGGGG.....',
    '..CCCCCGGCCCCC..',
    '.CCCCCCBBCCCCCC.',
  ];
  const FACE_COLORS = { H: '#1f3a5f', B: '#e7b75a', K: '#13243c', S: '#e0a77c', E: '#1a1a1a', N: '#c98b62', G: '#cfd3da', M: '#7a4a3a', P: '#6b4a2f', C: '#24385a' };
  function drawFace(c, ox, oy, s) {
    s = s || 1;
    FACE.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') rr(c, ox + x * s, oy + y * s, s, s, FACE_COLORS[ch]); }));
  }

  root.CoveSprites = { rr, hex, mix, SPEC, BLACKFLAG, drawShip, drawMini, drawFace };
})(typeof window !== 'undefined' ? window : globalThis);
