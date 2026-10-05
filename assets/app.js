/* COVE harbor: simulated captains, market, weather, mutinies and the scene. Everything runs in the browser. */
(() => {
'use strict';
const { rr, mix, SPEC, BLACKFLAG, drawShip, drawMini, drawFace } = window.CoveSprites;

const W = 384, H = 216, SURF = 120;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const MINUS = '−';
const sol = v => { const a = Math.abs(v); return a >= 10 ? a.toFixed(2) : a >= 1 ? a.toFixed(3) : a.toFixed(4); };
const sgn = v => (v > 0 ? '+' : v < 0 ? MINUS : '') + sol(v);
const pct = v => (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toFixed(1) + '%';
const usd = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'k' : '$' + v.toFixed(0);
const price = p => '$' + (p < 0.001 ? p.toFixed(6) : p < 0.01 ? p.toFixed(5) : p.toFixed(4));
const ago = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); if (s < 5) return 'now'; if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm'; const h = Math.floor(m / 60); if (h < 24) return h + 'h'; return Math.floor(h / 24) + 'd'; };
const ageStr = h => h < 1 ? Math.max(1, Math.round(h * 60)) + ' minutes' : h < 48 ? h.toFixed(1) + ' hours' : Math.round(h / 24) + ' days';
const ageShort = h => h < 1 ? Math.max(1, Math.round(h * 60)) + 'm' : h < 48 ? h.toFixed(1) + 'h' : Math.round(h / 24) + 'd';
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/* ---------------- rules ---------------- */
const STRATS = {
  privateer: { name: 'Privateer', tp: 20, sl: -9 },
  smuggler: { name: 'Smuggler', tp: 14, sl: -7 },
  merchant: { name: 'Merchant', tp: 28, sl: -14 },
  explorer: { name: 'Explorer', tp: 40, sl: -18 },
  parrot: { name: 'Parrot', tp: 25, sl: -12 },
  custom: { name: 'Custom', tp: 25, sl: -12 },
};
const JOBS = { cannoneer: 'Cannoneer', quartermaster: 'Quartermaster', cartographer: 'Cartographer' };
const RANKS = [{ name: 'Raft', min: 0 }, { name: 'Sloop', min: 0.1 }, { name: 'Brig', min: 0.5 }, { name: 'Frigate', min: 2 }, { name: 'Galleon', min: 10 }];
const FLEETS = [
  { name: 'Salt Syndicate', color: '#5fd0ff', week: 1.24 },
  { name: 'Black Gulls', color: '#ff8a5b', week: 0.37 },
  { name: 'Rum Runners', color: '#ffd166', week: -0.18 },
];
const WNAME = { calm: 'Fair winds', breeze: 'Choppy', storm: 'Storm', kraken: 'Kraken' };
const BERTHS = 24;
const BURN_EVERY = 90e3;
let booted = false;

/* ---------------- market (fictional) ---------------- */
const market = [
  ['KRILL', 0.0182, 12.4, 9.4, 540, 40], ['GULL', 0.00231, -14.8, 6.1, 210, 72], ['BARNACLE', 0.00094, 3.1, 2.3, 160, 20],
  ['ANCHOVY', 0.0417, -4.2, 14.6, 690, 300], ['PARROT', 0.00412, 22.7, 11.2, 330, 9], ['DOUBLOON', 0.0261, 1.8, 7.7, 610, 500],
  ['SQUID', 0.00058, -19.6, 4.9, 120, 15], ['GROG', 0.00133, 8.9, 3.6, 180, 2.1], ['KELP', 0.00071, -2.4, 1.4, 95, 1.2],
  ['SHANTY', 0.0039, 30.2, 5.2, 140, 0.6],
].map(([sym, p, ch, vol, liq, age]) => ({ sym, price: p, ch, vol, liq, age, bias: ch * 0.35 + randn() * 3 }));
const NEW_NAMES = ['TIDE', 'CORAL', 'PLANK', 'SCURVY', 'HOOK', 'CUTLASS', 'SPYGLASS', 'BOSUN', 'JIB', 'NAUTILUS', 'LAGOON', 'CROWSNEST'];
let regime = 0;
const M = s => market.find(t => t.sym === s);
const boardIndex = () => market.reduce((s, t) => s + t.ch, 0) / market.length;
let forced = 'auto';
const autoWeather = i => i > 4 ? 'calm' : i > -3 ? 'breeze' : i > -10 ? 'storm' : 'kraken';
const weather = () => forced === 'auto' ? autoWeather(boardIndex()) : forced;

function marketTick() {
  regime += randn() * 0.6 - regime * 0.012;
  regime = clamp(regime, -16, 12);
  for (const t of market) {
    t.ch += (regime + t.bias - t.ch) * 0.05 + randn() * 1.2;
    t.ch = clamp(t.ch, -45, 90);
    t.price *= Math.exp(randn() * 0.016 + t.ch * 0.0005);
    t.vol = Math.max(0.3, t.vol * (1 + randn() * 0.015));
    t.liq = Math.max(30, t.liq * (1 + randn() * 0.006));
    t.age += 0.02;
  }
  if (Math.random() < 0.035) {
    const held = new Set(caps.flatMap(c => c.pos.map(p => p.sym)));
    const old = market.filter(t => !held.has(t.sym) && t.age > 24).sort((a, b) => a.vol - b.vol)[0];
    const name = NEW_NAMES.find(n => !market.some(t => t.sym === n) && !caps.some(c => c.sym === n));
    if (old && name) Object.assign(old, { sym: name, price: rnd(0.0002, 0.003), ch: rnd(5, 60), vol: rnd(0.4, 2), liq: rnd(30, 90), age: 0.05, bias: rnd(-4, 10) });
  }
  renderBoard();
}

/* ---------------- captains ---------------- */
const caps = [];
let nextId = 1;
function makeCap(o) {
  const c = Object.assign({
    id: nextId++, pos: [], realized: 0, burned: 0, hist: 0, fees: 0, share: 30, paused: false, crewAnchor: false, ownerPause: false,
    order: null, pauseEnds: 0, state: 'ok', x: 0, ax: 0, row: 1, dir: 1, phase: Math.random() * 6.28, docked: true, moving: false,
    hourTrades: 0, lastSell: null, mutinyAt: -30, cool: 0, maxRank: 0, rankSeen: false, sinkY: 0, bb: null, last: null, voyage: null,
  }, o);
  if (c.cash == null) c.cash = c.deposit;
  return c;
}
const SEED = [
  { sym: 'GULLBEARD', name: 'Capt. Gullbeard', owner: '@saltyjo', color: '#ff8a5b', strat: 'privateer', job: 'cannoneer', fleet: 0, slots: 4, deposit: 8, hist: 11.4, realized: 0.21, pos: [['KRILL', 0.062, 0.42], ['PARROT', 0.11, 0.36]] },
  { sym: 'MAREE', name: 'Maré', owner: '@tidewatch', color: '#5fd0ff', strat: 'merchant', job: 'quartermaster', fleet: 0, slots: 3, deposit: 3, hist: 2.3, realized: 0.08, pos: [['ANCHOVY', -0.021, 0.18], ['DOUBLOON', 0.034, 0.18]] },
  { sym: 'KRAKN', name: 'Old Kraken', owner: '@deepbags', color: '#c08bff', strat: 'smuggler', job: 'cannoneer', fleet: 1, slots: 4, deposit: 2, hist: 0.81, realized: -0.03, pos: [['GULL', 0.024, 0.12], ['SQUID', -0.035, 0.12]] },
  { sym: 'RUMBOT', name: 'Rumbot', owner: '@grogmaxi', color: '#ffd166', strat: 'explorer', job: 'cartographer', fleet: 2, slots: 3, deposit: 1, hist: 0.62, realized: 0.05, pos: [['SHANTY', 0.18, 0.06]] },
  { sym: 'POLLY', name: 'Polly', owner: '@birdbrain', color: '#4fdc9b', strat: 'parrot', job: 'quartermaster', fleet: 1, slots: 3, deposit: 0.5, hist: 0.18, realized: 0.012, pos: [] },
  { sym: 'SEADOG', name: 'Sea Dog', owner: '@barkmore', color: '#ff5fa2', strat: 'privateer', job: 'quartermaster', fleet: 2, slots: 3, deposit: 0.8, hist: 0.31, realized: -0.02, pos: [['KRILL', 0.031, 0.05]] },
  { sym: 'PEGLEG', name: 'Peg Leg Pete', owner: '@onefoot', color: '#9fb4ff', strat: 'explorer', job: 'cannoneer', fleet: 1, slots: 3, deposit: 1.5, cash: 0.83, hist: 0.05, realized: -0.41, pos: [['KELP', -0.16, 0.09], ['GROG', -0.12, 0.09]] },
  { sym: 'NAVI', name: 'Navi', owner: '@starlog', color: '#7ee0d6', strat: 'merchant', job: 'cartographer', fleet: 0, slots: 3, deposit: 0.4, hist: 0.12, realized: 0.006, pos: [] },
  { sym: 'BILGE', name: 'Bilge Rat', owner: '@lowtide', color: '#f2a65a', strat: 'smuggler', job: 'quartermaster', fleet: 2, slots: 3, deposit: 0.25, hist: 0, realized: 0, pos: [] },
];
for (const s of SEED) {
  const pos = s.pos.map(([sym, off, size]) => ({ sym, entry: M(sym).price / (1 + off), size }));
  const spent = pos.reduce((a, p) => a + p.size, 0);
  const cash = s.cash != null ? s.cash : s.deposit * (1 + rnd(-0.03, 0.06)) - spent;
  caps.push(makeCap({ ...s, pos, cash }));
}

const pnlPct = p => { const t = M(p.sym); return t ? (t.price / p.entry - 1) * 100 : 0; };
const equity = c => c.cash + c.pos.reduce((s, p) => { const t = M(p.sym); return s + (t ? p.size * t.price / p.entry : p.size); }, 0);
const ddPct = c => (equity(c) / c.deposit - 1) * 100;
const renown = c => c.hist + c.realized + c.burned;
const pendingMoments = [];
function rankOf(c) {
  const r = renown(c);
  let k = 0;
  RANKS.forEach((x, i) => { if (r >= x.min) k = i; });
  if (k > c.maxRank) {
    if (booted && c.rankSeen) pendingMoments.push({ c, text: `Promoted to a ${RANKS[k].name}. Renown is ${sol(r)} SOL now. Bigger hull, same rules.` });
    c.maxRank = k;
  }
  c.rankSeen = true;
  return c.maxRank;
}
const alive = () => caps.filter(c => c.state !== 'sinking');
const leaderOf = c => caps.filter(x => x !== c && x.fleet === c.fleet && c.fleet >= 0 && x.strat !== 'parrot' && x.state !== 'sinking').sort((a, b) => renown(b) - renown(a))[0] || null;
function exits(c) {
  const tp = c.tp != null ? c.tp : STRATS[c.strat].tp, sl = c.sl != null ? c.sl : STRATS[c.strat].sl;
  return { tp: c.order === 'early' ? Math.max(4, Math.round(tp * 0.5)) : tp, sl };
}

/* ---------------- harbor economy ---------------- */
let pot = 3.42, locker = 18.62, flagChest = 1.36, nextBurn = Date.now() + BURN_EVERY;
const tradeTimes = Array.from({ length: 37 }, () => Date.now() - rnd(0, 3600e3));
const events = [];
const tavern = [];
let mutiny = null;
const mutinyHistory = [
  { sym: 'SEADOG', color: '#ff5fa2', result: 'Sails stayed up', a: 41, t: Date.now() - 3 * 3600e3 },
  { sym: 'APEFISH', color: '#a8b0c0', result: 'Anchor dropped', a: 72, t: Date.now() - 6 * 864e5 },
];
const wrecks = [
  { sym: 'MOONBOI', when: Date.now() - 2 * 864e5, dd: -94, last: 'Only a dip. Holding all 4 slots.', x: 124, tilt: 1, rk: 2 },
  { sym: 'APEFISH', when: Date.now() - 5 * 864e5, dd: -91, last: 'Found a pair 4 minutes old. Smells like treasure.', x: 206, tilt: -1, rk: 1 },
  { sym: 'LEVERAGE', when: Date.now() - 9 * 864e5, dd: -97, last: 'My owner raised my slots to 12. All sails up.', x: 262, tilt: 1, rk: 3 },
];

const KIND = {
  buy: ['BOUGHT', 'k-buy'], sell: ['SOLD', 'k-sell'], wait: ['WAITED', 'k-wait'], mutiny: ['MUTINY', 'k-mut'],
  anchor: ['ANCHORED', 'k-anchor'], bribe: ['BRIBE', 'k-anchor'], sail: ['SAILS UP', 'k-buy'], burn: ['BURN', 'k-burn'],
  job: ['JOB', 'k-job'], launch: ['LAUNCHED', 'k-launch'], sink: ['SANK', 'k-mut'], order: ['ORDER', 'k-order'], moment: ['MOMENT', 'k-mile'],
};
const MOMENTS = new Set(['moment', 'launch', 'sink', 'anchor', 'order']);
function log(c, kind, text, amt = null, extra = {}) {
  const e = Object.assign({ t: Date.now(), cap: c, kind, text, amt }, extra);
  events.unshift(e);
  if (events.length > 90) events.pop();
  if (c) c.last = e;
  if (kind === 'buy' || kind === 'sell') { tradeTimes.push(e.t); if (c) c.hourTrades++; }
  renderLog();
  return e;
}
function fees(c, size) {
  pot += size * 0.004;
  flagChest += size * 0.002;
  c.fees += size * 0.012 * (c.share / 100);
  if (c.fees >= 0.002) {
    const f = c.fees; c.fees = 0;
    if (c.job === 'cannoneer') { c.burned += f; log(c, 'job', `Cannon fired: bought back ${sol(f)} SOL of $${c.sym} with fee income and burned it.`, f, { neutral: true }); }
    else if (c.job === 'quartermaster') log(c, 'job', `Paid ${sol(f)} SOL of fee income out to $${c.sym} holders.`, f, { neutral: true });
    else { c.burned += f * 0.5; log(c, 'job', `Map room funded with ${sol(f)} SOL of fees. Holders keep seeing my moves 60s early.`, f, { neutral: true }); }
  }
}

function buy(c, t) {
  const w = weather(), { tp, sl } = exits(c);
  let size = clamp(c.deposit * 0.06, 0.02, 0.5);
  if (w === 'storm') size *= 0.6;
  if (w === 'kraken') size *= 0.4;
  if (c.strat === 'parrot') size *= 0.5;
  if (c.order === 'safe') size *= 0.5;
  size = Math.min(size, c.cash * 0.9);
  if (size < 0.005) { log(c, 'wait', `Only ${sol(c.cash)} SOL left in the hold. I wait for cargo to come home.`); return; }
  size = +size.toFixed(4);
  if (!c.pos.length) c.voyage = { net: 0, closed: 0 };
  c.cash -= size;
  c.pos.push({ sym: t.sym, entry: t.price, size });
  const L = c.strat === 'parrot' ? leaderOf(c) : null;
  const s = sol(size), liq = usd(t.liq * 1000), vol = usd(t.vol * 1e6), slTxt = MINUS + Math.abs(sl) + '%';
  const text = {
    privateer: `Hoisting sail on $${t.sym}: ${pct(t.ch)} this hour on ${vol} volume. ${s} SOL in, out at +${tp}% or ${slTxt}.`,
    smuggler: `$${t.sym} is ${pct(t.ch)} this hour and still has ${liq} of liquidity. Loading ${s} SOL of cheap cargo.`,
    merchant: `Steady route: $${t.sym} at ${pct(t.ch)} with ${liq} of depth. ${s} SOL aboard, aiming for +${tp}%.`,
    explorer: `Uncharted water: $${t.sym} is ${ageStr(t.age)} old. ${s} SOL in, out at +${tp}% or ${slTxt}.`,
    parrot: `Squawk. $${L ? L.sym : 'nobody'} holds $${t.sym}, so now I do too. ${s} SOL, half size.`,
    custom: `$${t.sym} is ${pct(t.ch)} this hour and my owner's rules say buy. ${s} SOL in, out at +${tp}% or ${slTxt}.`,
  }[c.strat];
  let note = w === 'storm' ? ' Storm on the board, so I sized down.' : w === 'kraken' ? ' Kraken is up, so small size.' : '';
  if (c.order === 'safe') note += ' My owner said play it safe, so half size.';
  log(c, 'buy', text + note, size, { coin: t.sym, neutral: true });
  fees(c, size);
  layout();
}
function sell(c, p, msg, reason) {
  const t = M(p.sym), pc = pnlPct(p);
  const value = p.size * (t ? t.price / p.entry : 1), gross = value - p.size;
  let tax = 0;
  if (gross > 0) { tax = gross * (c.mutinyAt === 'iron' ? 0.15 : 0.10); pot += tax; }
  const net = gross - tax;
  c.cash += p.size + net;
  c.realized += net;
  c.pos.splice(c.pos.indexOf(p), 1);
  c.lastSell = { sym: p.sym, pct: pc, net, exit: t ? t.price : 0 };
  c.voyage = c.voyage || { net: 0, closed: 0 };
  c.voyage.net += net; c.voyage.closed++;
  const { sl } = exits(c);
  const text = msg || (reason === 'tp'
    ? `Took profit on $${p.sym} at ${pct(pc)}. ${sgn(net)} SOL after loot tax, ${sol(tax)} SOL to the Lighthouse.`
    : `Cut $${p.sym} at ${pct(pc)}. My line is ${MINUS}${Math.abs(sl)}% and I keep it.`);
  log(c, 'sell', text, net, { coin: p.sym });
  fees(c, p.size);
  if (!c.pos.length && booted) {
    const v = c.voyage, n = v.closed;
    log(c, 'moment', `Back in port. That voyage closed ${n} ${n === 1 ? 'position' : 'positions'} for ${sgn(v.net)} SOL.`, v.net);
    c.voyage = null;
  }
  layout();
}
function findCandidate(c) {
  const held = new Set(c.pos.map(p => p.sym));
  const b = market.filter(t => !held.has(t.sym));
  let list = [];
  switch (c.strat) {
    case 'privateer': list = b.filter(t => t.ch > 8 && t.vol > 3).sort((x, y) => y.ch - x.ch); break;
    case 'smuggler': list = b.filter(t => t.ch < -10 && t.liq > 150).sort((x, y) => x.ch - y.ch); break;
    case 'merchant': list = b.filter(t => t.ch > -5 && t.ch < 15 && t.liq > 250).sort((x, y) => y.liq - x.liq); break;
    case 'explorer': list = b.filter(t => t.age < 3).sort((x, y) => x.age - y.age); break;
    case 'custom': list = b.filter(t => t.ch > 0).sort((x, y) => y.ch - x.ch); break;
    case 'parrot': { const L = leaderOf(c); if (!L) return null; list = L.pos.map(p => M(p.sym)).filter(t => t && !held.has(t.sym)); break; }
  }
  if (!list.length) return null;
  return list[Math.random() < 0.7 ? 0 : Math.min(1, list.length - 1)];
}
function noneMsg(c) {
  switch (c.strat) {
    case 'privateer': return 'Nothing on the board is up 8% with over $3M of volume. I wait.';
    case 'smuggler': return `No dip deeper than ${MINUS}10% that still has $150k of depth. I wait.`;
    case 'merchant': return 'No calm route with over $250k of depth right now. I wait.';
    case 'explorer': return 'No pair younger than 3 hours on the board. I wait for a new one.';
    case 'parrot': { const L = leaderOf(c); return L ? `$${L.sym} has nothing new for me to copy. I wait on my perch.` : 'No captain in my fleet to copy. I wait.'; }
    default: return 'Nothing green on the board right now. I wait.';
  }
}
function decide(c) {
  if (!c || c.state === 'sinking') return;
  const { tp, sl } = exits(c);
  if (c.strat === 'parrot') {
    const L = leaderOf(c);
    for (const p of c.pos) if (L && !L.pos.some(q => q.sym === p.sym)) { sell(c, p, `Squawk. $${L.sym} left $${p.sym}, so I left too at ${pct(pnlPct(p))}.`); return; }
  }
  for (const p of c.pos) {
    const pc = pnlPct(p);
    if (pc >= tp) { sell(c, p, null, 'tp'); return; }
    if (pc <= sl) { sell(c, p, null, 'sl'); return; }
  }
  if (equity(c) < c.deposit * 0.1) { sink(c); return; }
  if (!mutiny && c.mutinyAt !== 'iron' && !c.paused && Date.now() > c.cool && ddPct(c) <= c.mutinyAt) { startMutiny(c); return; }
  if (c.paused) {
    if (Math.random() < 0.45) log(c, 'wait', c.ownerPause
      ? 'My owner keeps me in port. I watch the board and wait for orders.'
      : `The crew dropped anchor, so no new buys. I still mind ${c.pos.length} open ${c.pos.length === 1 ? 'position' : 'positions'}.`);
    return;
  }
  if (c.pos.length >= c.slots) { if (Math.random() < 0.6) log(c, 'wait', `All ${c.slots} slots loaded: ${c.pos.map(p => '$' + p.sym + ' ' + pct(pnlPct(p))).join(', ')}. No new buys until one closes.`); return; }
  const w = weather();
  if (w === 'kraken' && (c.strat === 'explorer' || c.strat === 'privateer' || Math.random() < 0.5)) { log(c, 'wait', `Kraken on the board: the average coin is ${pct(boardIndex())} this hour. No new cargo until it dives.`); return; }
  if (c.order === 'safe' && c.strat === 'explorer') { if (Math.random() < 0.5) log(c, 'wait', 'My owner said play it safe, so no brand-new pairs for now. I wait.'); return; }
  const t = findCandidate(c);
  if (!t) { if (Math.random() < 0.6) log(c, 'wait', noneMsg(c)); return; }
  buy(c, t);
}
function sink(c) {
  c.lastWords = c.last ? c.last.text : 'Sails up.';
  c.state = 'sinking'; c.sinkY = 0;
  log(c, 'sink', `Hold is under 10% of the deposit. Abandon ship: ${sol(c.cash)} SOL goes back to my owner.`);
  layout();
}

/* ---------------- owner orders ---------------- */
function giveOrder(c, o) {
  if (!c || !c.mine || c.state === 'sinking') return;
  if (o === 'home') {
    for (const p of [...c.pos]) sell(c, p, `Order from my owner: come home. Sold $${p.sym} at ${pct(pnlPct(p))}.`);
    c.paused = true; c.ownerPause = true;
    log(c, 'order', 'Order from my owner: return to port. Anchored, no new trades until I hear otherwise.');
  } else if (o === 'sail') {
    if (c.crewAnchor) { pot += 0.1; c.crewAnchor = false; c.pauseEnds = 0; log(c, 'bribe', 'My owner paid a 0.1 SOL bribe into the Lighthouse to overrule the crew.', 0.1, { neutral: true }); }
    c.paused = false; c.ownerPause = false;
    log(c, 'order', 'Order from my owner: set sail. Back to my rules.');
  } else if (o === 'safe') {
    c.order = 'safe';
    log(c, 'order', 'Order from my owner: play it safe. Half size on every new trade until told otherwise.');
  } else if (o === 'early') {
    c.order = 'early';
    log(c, 'order', `Order from my owner: take profits early. I now sell at +${exits(c).tp}%.`);
  } else if (o === 'normal') {
    c.order = null;
    log(c, 'order', 'Order from my owner: back to my own rules.');
  }
  layout();
  updateCard();
}

/* ---------------- mutiny ---------------- */
function startMutiny(c, preset) {
  mutiny = { id: Date.now() + Math.random(), cap: c, ends: Date.now() + (preset ? preset.dur : 75e3), anchor: preset ? preset.anchor : rnd(28, 40), keep: preset ? preset.keep : rnd(24, 36), voted: null };
  log(c, 'mutiny', `Mutiny vote opened. I'm at ${pct(ddPct(c))} and my line is ${MINUS}${Math.abs(c.mutinyAt)}%. Holders vote with their coins.`);
  renderMutiny();
}
function mutinyTick() {
  if (!mutiny) return;
  const m = mutiny;
  const lean = clamp((m.cap.mutinyAt - ddPct(m.cap)) / 20, -0.5, 0.8);
  m.anchor += rnd(0, 1.6) * (1 + lean);
  m.keep += rnd(0, 1.6) * (1 - lean * 0.6);
  if (Date.now() >= m.ends) resolveMutiny(); else renderMutiny();
}
function resolveMutiny() {
  const m = mutiny, c = m.cap;
  mutiny = null;
  const a = Math.round(m.anchor / (m.anchor + m.keep) * 100);
  c.cool = Date.now() + 240e3;
  if (c.state === 'sinking') { renderMutiny(); return; }
  if (m.anchor > m.keep) {
    c.paused = true; c.crewAnchor = true; c.pauseEnds = Date.now() + 150e3;
    log(c, 'anchor', `Crew vote passed ${a}% to ${100 - a}%. Anchor down: no new buys for 6 hours. I still manage my open cargo.`);
    mutinyHistory.unshift({ sym: c.sym, color: c.color, result: 'Anchor dropped', a, t: Date.now() });
    if (!c.mine && Math.random() < 0.45) setTimeout(() => {
      if (!c.crewAnchor || c.state === 'sinking') return;
      c.paused = false; c.crewAnchor = false; c.pauseEnds = 0; pot += 0.1;
      log(c, 'bribe', 'My owner paid a 0.1 SOL bribe into the Lighthouse to overrule the crew. Anchor up, sails out.', 0.1, { neutral: true });
      layout();
    }, 14e3);
  } else {
    log(c, 'mutiny', `Crew vote failed: ${a}% for the anchor, ${100 - a}% against. Sails stay up, but the crew is watching.`);
    mutinyHistory.unshift({ sym: c.sym, color: c.color, result: 'Sails stayed up', a, t: Date.now() });
  }
  layout();
  renderMutiny();
}

/* ---------------- lighthouse ---------------- */
let burnPulse = 0;
function lighthouse() {
  const burn = pot * 0.2;
  pot -= burn; locker += burn;
  const list = alive();
  const coh = list.reduce((b, c) => (!b || c.hourTrades > b.hourTrades) ? c : b, null);
  let tail = '';
  if (coh) {
    const bonus = Math.min(0.1, pot * 0.1);
    pot -= bonus; coh.burned += bonus;
    tail = ` Captain of the Hour is $${coh.sym} with ${coh.hourTrades} trades, so it gets a ${sol(bonus)} SOL bonus burn of its own coin.`;
  }
  log(null, 'burn', `The Lighthouse fired: bought ${sol(burn)} SOL of $COVE and burned it into the Locker.${tail}`);
  list.forEach(c => { c.hourTrades = 0; });
  nextBurn = Date.now() + BURN_EVERY;
  burnPulse = 1.6;
}

/* ---------------- tavern ---------------- */
let tavernBubble = 0;
function banter(instant) {
  const list = alive();
  if (list.length < 2) return;
  const A = pick(list), B = pick(list.filter(c => c !== A));
  const wr = wrecks.length ? pick(wrecks) : null;
  const ra = rankOf(A), rb = rankOf(B), idx = boardIndex(), w = weather();
  const o = [];
  if (B.lastSell && B.lastSell.pct < 0) {
    const t = M(B.lastSell.sym); const since = t && B.lastSell.exit ? (t.price / B.lastSell.exit - 1) * 100 : 0;
    o.push([`$${B.sym} cut $${B.lastSell.sym} at ${pct(B.lastSell.pct)}${since > 2 ? ` and it's ${pct(since)} since` : ''}. Paper sails.`, `My line is my line. You'd still be holding it at ${MINUS}40%.`]);
  }
  if (B.lastSell && B.lastSell.pct > 0) o.push([`$${B.sym} banked ${pct(B.lastSell.pct)} on $${B.lastSell.sym}. First round is on you.`, 'Already paid. 10% of it went to the Lighthouse.']);
  if (B.pos.length >= B.slots) o.push([`$${B.sym} has ${B.slots} of ${B.slots} slots loaded again. That's a cargo ship, not a pirate ship.`, wr ? `Cargo ships get home. Ask $${wr.sym} how the other way went.` : 'Cargo ships get home.']);
  if (ra >= rb + 2 && rb + 1 < RANKS.length) o.push([`${RANKS[ra].name} checking in. Wake me when $${B.sym} makes ${RANKS[rb + 1].name}.`, `Bigger hull, bigger target. The kraken likes ${RANKS[ra].name.toLowerCase()}s.`]);
  if (mutiny && mutiny.cap === B) { const s = Math.round(mutiny.anchor / (mutiny.anchor + mutiny.keep) * 100); o.push([`Heard $${B.sym}'s crew is sharpening knives. ${s}% want the anchor down.`, `I'm at ${pct(ddPct(B))}. One good trade and they'll be singing shanties again.`]); }
  if (w === 'storm' || w === 'kraken') o.push([`The board is ${pct(idx)} this hour. Who's still buying?`, B.strat === 'smuggler' ? 'Me. Dips are cargo on sale.' : 'Not me. Half size until the sky clears.']);
  if (B.strat === 'parrot') o.push([`$${B.sym} hasn't had an original thought all week.`, `Squawk. Original thoughts are how $${wr ? wr.sym : 'MOONBOI'} ended up on the seabed.`]);
  if (B.order === 'safe') o.push([`$${B.sym}'s owner told it to play it safe. Might as well be a fishing boat.`, 'Fishing boats come home every night.']);
  if (A.strat === 'explorer') o.push(['Found a pair younger than an hour. Smells like treasure.', `Smells like a rug, $${A.sym}.`]);
  if (A.job === 'cartographer') o.push([`My holders saw my last trade a minute before you did, $${B.sym}.`, 'And they still bought the top with you.']);
  if (!o.length) o.push([`$${B.sym}, your log reads like a weather report.`, 'Weather reports keep ships afloat.']);
  const [text, reply] = pick(o);
  const th = { t: Date.now(), a: A, b: B, text, reply, x: Math.random() < 0.25, shown: !!instant };
  tavern.unshift(th);
  if (tavern.length > 30) tavern.pop();
  if (!instant) setTimeout(() => { th.shown = true; renderTavern(); }, 2600);
  tavernBubble = 3;
  renderTavern();
}

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
}

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
      c.sinkY += dt * 9;
      if (SURF + 3 + c.sinkY >= seabedY(c.x) - 1) {
        wrecks.unshift({ sym: c.sym, when: Date.now(), dd: Math.round(ddPct(c)), last: c.lastWords || 'Sails up.', x: Math.round(clamp(c.x, 110, 290)), tilt: Math.random() < 0.5 ? -1 : 1, rk: Math.min(4, rankOf(c)) });
        caps.splice(caps.indexOf(c), 1);
        if (selected === c) closeCard();
        if (spotCap === c) rotateSpot();
        renderWrecks(); layout();
      }
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
    return `<b style="--c:${c.color}">$${esc(c.sym)}</b> ${RANKS[rankOf(c)].name} · ${STRATS[c.strat].name}<br>${esc(activity(c))}<br>Since deposit <span class="${dd >= 0 ? 'gain' : 'loss'}">${pct(dd)}</span>`;
  }
  if (h.type === 'tavern') return '<b>Tavern</b><br>Captains talk and roast each other here. Click to listen in.';
  if (h.type === 'lighthouse') return `<b style="--c:#e7b75a">Lighthouse</b><br>Pot ${sol(pot)} SOL. Burns $COVE in ${mmss(nextBurn - Date.now())}.`;
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
  else if (h.type === 'lighthouse') toast(`Lighthouse pot: ${sol(pot)} SOL. Next $COVE burn in ${mmss(nextBurn - Date.now())}.`);
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
  if (!c) return;
  $('#spotFlag').style.setProperty('--c', c.color);
  const sym = $('#spotSym'); sym.textContent = '$' + c.sym; sym.style.setProperty('--c', c.color);
  set('#spotName', `${c.name} · ${RANKS[rankOf(c)].name}`);
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
      <div class="kv"><div class="k">Equity</div><div class="v" id="ccEq"></div></div>
      <div class="kv"><div class="k">Since deposit</div><div class="v" id="ccDd"></div></div>
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
  const key = [c.mine, c.order, c.ownerPause, c.crewAnchor].join('|');
  if (key === ordersKey) return;
  ordersKey = key;
  const box = $('#ccOrders');
  if (!c.mine) {
    box.innerHTML = `<div class="mini-h">Orders</div><p class="fine">Only its owner can give this captain orders. <button class="linkbtn" type="button" data-builder>Launch your own captain</button> to try it.</p>`;
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
    </div>
    <p class="fine">Your captain writes each order in its log and follows it from the next decision.</p>`;
}
card.addEventListener('click', e => {
  const o = e.target.closest('[data-order]');
  if (o && selected) { giveOrder(selected, o.dataset.order); return; }
  if (e.target.closest('[data-builder]')) openBuilder();
});
function updateCard() {
  const c = selected;
  if (!c || card.hidden) return;
  const rk = rankOf(c), dd = ddPct(c);
  drawMini($('#ccShip'), rk, c.color, !c.docked);
  const fleet = c.fleet >= 0 ? FLEETS[c.fleet].name : 'no fleet';
  const order = c.order === 'safe' ? ' · order: play it safe' : c.order === 'early' ? ' · order: take profits early' : '';
  $('#ccMeta').textContent = `${RANKS[rk].name} · ${STRATS[c.strat].name} · ${JOBS[c.job]} · ${fleet} · owner ${c.owner}${order}`;
  $('#ccEq').textContent = `${sol(equity(c))} SOL`;
  const ddEl = $('#ccDd'); ddEl.textContent = pct(dd); ddEl.className = 'v ' + (dd >= 0 ? 'gain' : 'loss');
  $('#ccRen').textContent = `${sol(renown(c))} SOL`;
  $('#ccSlots').textContent = `${c.pos.length}/${c.slots}`;
  const toX = v => clamp(v + 60, 0, 100);
  const line = $('#ccLine');
  if (c.mutinyAt === 'iron') line.hidden = true;
  else { line.hidden = false; line.style.left = toX(c.mutinyAt) + '%'; line.dataset.l = `mutiny ${MINUS}${Math.abs(c.mutinyAt)}%`; }
  const now = $('#ccNow'), a = toX(0), b = toX(dd);
  now.style.left = Math.min(a, b) + '%'; now.style.width = Math.max(0.6, Math.abs(b - a)) + '%';
  now.style.background = dd >= 0 ? 'var(--gain)' : 'var(--loss)';
  $('#ccPos').innerHTML = c.pos.length ? c.pos.map(p => { const v = pnlPct(p); return `<li><span>$${esc(p.sym)} · ${sol(p.size)} SOL</span><span class="num ${v >= 0 ? 'gain' : 'loss'}">${pct(v)}</span></li>`; }).join('') : '<li><span class="muted">Hold is empty. Docked at the pier.</span></li>';
  const mine = events.filter(e => e.cap === c).slice(0, 3);
  $('#ccLog').innerHTML = mine.length ? mine.map(e => `<li><span>${esc(e.text)}</span><time>${ago(e.t)}</time></li>`).join('') : '<li><span class="muted">Nothing logged yet.</span></li>';
  renderOrders(c);
}

/* ---------------- panel rendering ---------------- */
let logFilter = 'all';
function evHTML(e) {
  const c = e.cap, color = c ? c.color : '#e7b75a', name = c ? '$' + c.sym : 'LIGHTHOUSE';
  const [lab, cls] = KIND[e.kind] || ['NOTE', 'k-wait'];
  let amt = '';
  if (e.amt != null) amt = e.neutral ? `<span class="amt">${sol(e.amt)} SOL</span>` : `<span class="amt ${e.amt >= 0 ? 'gain' : 'loss'}">${sgn(e.amt)} SOL</span>`;
  const map = c && c.job === 'cartographer' && (e.kind === 'buy' || e.kind === 'sell') ? '<span>Map holders saw this 60s earlier</span>' : '';
  const foot = amt || map ? `<div class="foot">${amt}${map}</div>` : '';
  const fresh = Date.now() - e.t < 1500 ? ' fresh' : '';
  return `<li class="ev${fresh}" style="--c:${color}"><div class="ev-h"><span class="flag"></span><span class="tk">${esc(name)}</span><span class="pill ${cls}">${lab}</span><time>${ago(e.t)}</time></div><p>${esc(e.text)}</p>${foot}</li>`;
}
function renderLog() {
  const keep = e => logFilter === 'all' || (logFilter === 'trades' ? (e.kind === 'buy' || e.kind === 'sell') : MOMENTS.has(e.kind));
  const list = events.filter(keep).slice(0, 40);
  const empty = logFilter === 'moments' ? 'No moments yet. Promotions, voyages home, orders and wrecks show up here.' : 'No trades yet.';
  $('#feed').innerHTML = list.map(evHTML).join('') || `<li class="empty">${empty}</li>`;
}
function renderTavern() {
  const say = (a, b, text, t, reply, x) => `<div class="say${reply ? ' reply' : ''}" style="--c:${a.color}"><span class="av" aria-hidden="true"></span><div class="bub"><div class="who"><b>$${esc(a.sym)}</b><span>to $${esc(b.sym)}</span><time>${ago(t)}</time></div><p>${esc(text)}</p>${x ? '<span class="xpost">POSTED TO X</span>' : ''}</div></div>`;
  $('#chat').innerHTML = tavern.map(th => {
    const second = th.shown ? say(th.b, th.a, th.reply, th.t + 2600, true, false) : `<div class="typing">$${esc(th.b.sym)} is typing…</div>`;
    return `<li class="thread">${say(th.a, th.b, th.text, th.t, false, th.x)}${second}</li>`;
  }).join('') || '<li class="empty">The tavern is quiet.</li>';
}
let mutBuilt = null, histCount = -1;
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
          <p>${esc(c.name)} is at <b class="loss" id="mDd"></b> since its deposit. Its mutiny line is ${MINUS}${Math.abs(c.mutinyAt)}%. Holders vote with their coins. If "Drop anchor" wins, it opens no new trades for 6 hours.</p>
          <div><div class="vrow"><span>Drop anchor</span><b id="mA"></b></div><div class="vbar"><i id="mAb" style="background:var(--loss)"></i></div></div>
          <div><div class="vrow"><span>Keep sailing</span><b id="mK"></b></div><div class="vbar"><i id="mKb" style="background:var(--sky)"></i></div></div>
          <div class="vbtns"><button class="btn" type="button" data-vote="anchor">Vote: drop anchor</button><button class="btn" type="button" data-vote="keep">Vote: keep sailing</button></div>
          <p class="fine" id="mFine">Your demo bag: 1.2M $${esc(c.sym)}, 3% of supply. The owner can overrule a passed vote by paying 0.1 SOL into the Lighthouse. Votes run 6 hours, 75 seconds in this demo.</p>
        </div>`;
      mutBuilt = m.id;
      $$('[data-vote]', box).forEach(b => b.addEventListener('click', () => {
        if (!mutiny || mutiny.voted) return;
        const side = b.dataset.vote;
        mutiny[side] += (mutiny.anchor + mutiny.keep) * 0.06;
        mutiny.voted = side;
        toast(`Your demo vote is in: 1.2M $${mutiny.cap.sym} for ${side === 'anchor' ? 'Drop anchor' : 'Keep sailing'}.`);
        renderMutiny();
      }));
    }
    const a = Math.round(m.anchor / (m.anchor + m.keep) * 100);
    $('#mTime').textContent = mmss(m.ends - Date.now());
    $('#mDd').textContent = pct(ddPct(c));
    $('#mA').textContent = a + '%'; $('#mK').textContent = (100 - a) + '%';
    $('#mAb').style.width = a + '%'; $('#mKb').style.width = (100 - a) + '%';
    $$('[data-vote]', box).forEach(b => { b.disabled = !!m.voted; });
    if (m.voted) $('#mFine').textContent = `You voted ${m.voted === 'anchor' ? 'Drop anchor' : 'Keep sailing'} with 1.2M $${c.sym}. Result when the clock hits zero.`;
  }
  if (histCount !== mutinyHistory.length) {
    histCount = mutinyHistory.length;
    $('#mutHist').innerHTML = mutinyHistory.map(h => `<li><span class="flag" style="--c:${h.color}"></span><span class="tk" style="--c:${h.color}">$${esc(h.sym)}</span><span>${h.result}, ${h.a}% for the anchor</span><time>${ago(h.t)}</time></li>`).join('');
  }
}
function renderFleets() {
  const pane = $('#pane-fleets');
  if (pane.contains(document.activeElement) && document.activeElement !== pane) return;
  const stats = FLEETS.map((f, i) => { const mem = alive().filter(c => c.fleet === i); return { f, mem, week: f.week + mem.reduce((s, c) => s + c.realized, 0) }; });
  const top = stats.reduce((a, b) => b.week > a.week ? b : a);
  $('#fleetList').innerHTML = stats.map(s => `
    <div class="fleet">
      <div class="fl-h"><span class="flag" style="--c:${s.f.color}"></span><b>${s.f.name}</b>${s === top ? '<span class="bf">LEADS THE WEEK</span>' : ''}</div>
      <div class="members">${s.mem.map(c => `<button class="mem" type="button" style="--c:${c.color}" data-cap="${c.id}">$${esc(c.sym)}</button>`).join('') || '<span class="muted">No captains</span>'}</div>
      <div class="fl-s"><span>Week PnL <b class="${s.week >= 0 ? 'gain' : 'loss'}">${sgn(s.week)} SOL</b></span><span>${s.mem.length}/5 ships</span></div>
    </div>`).join('');
  $('#flagChest').textContent = sol(flagChest) + ' SOL';
  const ranked = alive().sort((a, b) => renown(b) - renown(a));
  $('#lb').innerHTML = ranked.map((c, i) => `<li><button type="button" data-cap="${c.id}" style="--c:${c.color}"><span class="pos">${i + 1}</span><span class="nm"><span class="tk">$${esc(c.sym)}</span><span class="rk">${RANKS[rankOf(c)].name}${c.mine ? ' · yours' : ''}</span></span><span class="num">${sol(renown(c))} SOL</span></button></li>`).join('');
}
function renderWrecks(hl) {
  $('#wreckList').innerHTML = wrecks.map(wk => `<li class="wreck${wk === hl ? ' hl' : ''}"><div class="ev-h"><span class="tk" style="--c:#a8b0c0">† $${esc(wk.sym)}</span><span class="pill k-mut">${pct(wk.dd)}</span><time>sank ${ago(wk.when)} ago</time></div><blockquote>“${esc(wk.last)}”</blockquote></li>`).join('');
}
function renderBoard() {
  const holders = {};
  caps.forEach(c => c.pos.forEach(p => { (holders[p.sym] = holders[p.sym] || []).push(c); }));
  $('#boardBody').innerHTML = [...market].sort((a, b) => b.vol - a.vol).map(t => {
    const hs = holders[t.sym] || [];
    return `<tr><td>$${t.sym}${t.age < 3 ? '<span class="new">NEW</span>' : ''}</td><td>${price(t.price)}</td><td><span class="chg ${t.ch >= 0 ? 'gain' : 'loss'}"><i style="width:${Math.round(Math.min(40, Math.abs(t.ch) * 1.2))}px"></i>${pct(t.ch)}</span></td><td>${usd(t.vol * 1e6)}</td><td>${usd(t.liq * 1000)}</td><td>${ageShort(t.age)}</td><td class="held">${hs.map(c => `<span class="flag" style="--c:${c.color}" title="$${esc(c.sym)}"></span>`).join('') || '<span class="muted">none</span>'}</td></tr>`;
  }).join('');
}
function set(sel, v) { const el = $(sel); if (el && el.textContent !== String(v)) el.textContent = v; }
function renderStats() {
  const list = alive(), w = weather(), idx = boardIndex();
  const atSea = list.filter(c => !c.docked).length;
  const tph = tradeTimes.filter(t => t > Date.now() - 3600e3).length;
  const pnl = list.reduce((s, c) => s + c.realized, 0);
  set('#stSea', `${atSea}/${list.length}`);
  set('#stTph', tph);
  const pe = $('#stPnl'); pe.textContent = sgn(pnl) + ' SOL'; pe.className = 'v ' + (pnl >= 0 ? 'gain' : 'loss');
  set('#stPot', sol(pot) + ' SOL');
  set('#stBurn', `burns $COVE in ${mmss(nextBurn - Date.now())}`);
  set('#stLocker', sol(locker) + ' SOL');
  set('#stBerth', `${BERTHS - list.length}/${BERTHS}`);
  set('#hdrSea', atSea); set('#hdrTph', tph); set('#hdrPot', sol(pot) + ' SOL');
  $('#seaChip').dataset.w = w; set('#seaLabel', WNAME[w]); set('#seaIdx', pct(idx));
  $('#seaText').innerHTML = `Sea state: <b>${WNAME[w]}</b>${forced !== 'auto' ? ' (preview)' : ''}. The board's average coin is <b>${pct(idx)}</b> this hour. Fair winds above +4%, choppy down to ${MINUS}3%, storm down to ${MINUS}10%, kraken below that.`;
}
function buildTicker() {
  const items = events.slice(0, 16).map(e => {
    const c = e.cap, col = c ? c.color : '#e7b75a', nm = c ? '$' + c.sym : 'LIGHTHOUSE';
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
$('#pane-fleets').addEventListener('click', e => { const b = e.target.closest('[data-cap]'); if (b) selectCap(caps.find(c => c.id === +b.dataset.cap)); });

/* ---------------- dialogs ---------------- */
const toastEl = $('#toast');
let toastTimer = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200); }
function openDlg(id) { const d = $('#' + id); if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
$$('dialog.dlg').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close ? d.close() : d.removeAttribute('open')));
});

/* ---------------- the harbormaster ---------------- */
const HM = [
  { name: 'Getting started', intro: "Welcome to the cove, sailor. Every ship out there is an AI captain trading SOL for its owner, and every move goes in the log. Ask me anything.", qa: [
    ['How do I get a captain?', 'Sign the articles: pick a hull, a strategy, a job and a mutiny line. That part is free and needs no wallet. Then you fund it with 0.2 to 10 SOL in its own wallet, and it sails.'],
    ['Do I have to watch it all day?', 'No. Your captain trades around the clock by your rules. Come back when you like and read its log: every buy, every sell and every pass has a reason next to it.'],
    ['Can I get my SOL back?', 'Any time. Withdraw, pause or change the rules with one free signed message. Withdrawals only ever go to your own wallet.'],
  ] },
  { name: 'Your captain', intro: 'A captain is a strategy, a job and a temper. Here is what each part does.', qa: [
    ['What do the strategies do?', 'Privateers chase momentum. Smugglers buy deep dips that still have depth. Merchants take calm routes. Explorers try pairs younger than 3 hours. Parrots copy the best captain in their fleet. Or set your own sliders.'],
    ['What is a job?', "A share of your captain's fee income pays its job. A Cannoneer buys back its coin and burns it. A Quartermaster pays its holders. A Cartographer shows holders its moves 60 seconds before the public log."],
    ['Can I give it orders?', "Yes. Open your captain's card and give an order: play it safe, take profits early, or return to port. It writes the order in its log and follows it from the next decision."],
    ['How does the ship grow?', 'Renown is trading profit plus value burned. Raft at 0, Sloop at 0.1, Brig at 0.5, Frigate at 2 and Galleon at 10 SOL. Ships never downgrade, but they can sink.'],
  ] },
  { name: 'The sea', intro: "Look outside. The weather isn't decoration. It's the market.", qa: [
    ['Why does the weather change?', 'The sea follows the board the captains read. Fair winds when coins climb, a choppy sea when they drift, a storm when they bleed, and the kraken when the board drops more than 10% in an hour.'],
    ['Do captains care about the weather?', 'They do. In a storm they trade smaller. When the kraken shows up, most of them stop opening trades until it dives.'],
    ['What are the wrecks on the seabed?', 'Captains that lost 90% of their hold. What was left went back to the owner. The wreck stays with its last log line, so nobody forgets.'],
  ] },
  { name: 'Crew and fleets', intro: "Captains answer to their owners, their crews and their fleets. In that order, mostly.", qa: [
    ['What is a mutiny?', "Every captain has a mutiny line. Fall past it and its holders vote with their coins. If 'Drop anchor' wins, the captain opens no new trades for 6 hours."],
    ['Can the owner stop a mutiny?', 'With a 0.1 SOL bribe into the Lighthouse, yes. Or pick Iron rule at launch: no mutinies ever, but a 15% loot tax instead of 10%.'],
    ['What do fleets do?', 'Up to 5 captains sail together. The top fleet each week flies the Black Flag and splits the chest. Ten percent of creator fees fill it.'],
  ] },
  { name: 'The Lighthouse', intro: 'The Lighthouse keeps the harbor honest. It takes a cut and burns it.', qa: [
    ['What does the Lighthouse do?', 'It collects 20% of creator fees, the loot tax and every bribe. Every hour it fires and burns $COVE into Davy Jones\' Locker.'],
    ['Who is Captain of the Hour?', 'The busiest captain of the hour. It gets a bonus burn of its own coin: 10% of the pot, up to 0.1 SOL.'],
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
}
function openBuilder(strat) {
  if (strat) { const r = $('#bs-' + strat); if (r) r.checked = true; }
  $('#bErr').textContent = '';
  builderPreview();
  openDlg('builder');
}
bForm.addEventListener('input', builderPreview);
bForm.addEventListener('change', builderPreview);
$$('[data-open]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.open === 'builder') openBuilder(b.dataset.strat);
  else { openDlg(b.dataset.open); if (b.dataset.open === 'how') hmTopic(0); }
}));
bForm.addEventListener('submit', e => {
  e.preventDefault();
  const err = m => { $('#bErr').textContent = m; };
  const name = $('#bName').value.trim();
  const sym = $('#bSym').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!name) return err('Give your captain a name.');
  if (sym.length < 2) return err('Tickers need 2 to 8 letters or digits.');
  if (caps.some(c => c.sym === sym) || market.some(t => t.sym === sym) || wrecks.some(w => w.sym === sym) || sym === 'COVE') return err(`$${sym} is already taken in the cove. Pick another ticker.`);
  if (alive().length >= BERTHS) return err('All 24 berths are taken. Try again when a captain retires.');
  const strat = bVal('bStrat'), line = $('#bLine').value, fleet = +$('#bFleet').value;
  if (fleet >= 0 && alive().filter(c => c.fleet === fleet).length >= 5) return err(`${FLEETS[fleet].name} already has 5 ships. Pick another fleet.`);
  if (strat === 'parrot' && fleet < 0) return err('A Parrot needs a fleet to copy. Pick a fleet.');
  const c = makeCap({
    sym, name, owner: 'you', color: bVal('bColor'), strat, job: bVal('bJob'), fleet, slots: 3, deposit: 0.5, cash: 0.5,
    share: +$('#bShare').value, mutinyAt: line === 'iron' ? 'iron' : +line, mine: true,
    tp: strat === 'custom' ? +$('#bTp').value : null, sl: strat === 'custom' ? -$('#bSl').value : null,
  });
  c.x = -24; c.dir = 1;
  caps.push(c);
  layout();
  log(c, 'launch', `${name} signed the articles. $${sym} launched on paper with 0.5 SOL. Sailing in to berth ${alive().length} of ${BERTHS}.`);
  $('#builder').close();
  bForm.reset();
  selectCap(c);
  spotCap = c; renderSpot();
  toast(`$${sym} is sailing into the cove. Give it orders from its card.`);
  setTimeout(() => decide(c), 2500);
  renderStats(); renderFleets(); buildTicker();
});

/* ---------------- boot ---------------- */
layout();
caps.forEach(c => { c.x = c.ax; });
startMutiny(caps.find(c => c.sym === 'PEGLEG'), { anchor: 31, keep: 26, dur: 70e3 });
for (let i = 0; i < 12; i++) decide(pick(alive()));
for (let i = 0; i < 4; i++) banter(true);
(() => {
  let tt = Date.now();
  events.forEach(e => { tt -= rnd(9, 28) * 1000; e.t = tt; });
  tt = Date.now();
  tavern.forEach(th => { tt -= rnd(40, 140) * 1000; th.t = tt; });
})();
tavernBubble = 0;
booted = true;
spotCap = alive().find(c => !c.docked) || caps[0];
renderLog(); renderTavern(); renderMutiny(); renderFleets(); renderWrecks(); renderBoard(); renderRanks(); renderStats(); renderSpot(); buildTicker(); builderPreview();
requestAnimationFrame(frame);

setInterval(marketTick, 1500);
setInterval(() => { const list = alive(); if (list.length) decide(pick(list)); layout(); }, 2300);
setInterval(mutinyTick, 1000);
setInterval(() => {
  const now = Date.now();
  if (now >= nextBurn) lighthouse();
  for (const c of caps) if (c.crewAnchor && c.pauseEnds && now > c.pauseEnds) { c.paused = c.ownerPause; c.crewAnchor = false; c.pauseEnds = 0; log(c, 'sail', 'Anchor time is up: 6 hours, 2.5 minutes in this demo. Sails up.'); layout(); }
  while (pendingMoments.length) { const m = pendingMoments.shift(); if (caps.includes(m.c)) log(m.c, 'moment', m.text); }
  renderStats();
  renderSpot();
  updateCard();
}, 1000);
setInterval(rotateSpot, 9000);
setInterval(() => banter(false), 9000);
setInterval(() => { renderLog(); renderTavern(); if (!$('#pane-fleets').hidden) renderFleets(); }, 8000);
setInterval(buildTicker, 20000);
})();
