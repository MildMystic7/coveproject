// The harbor's rules. Pure functions over one JSON world; the API routes load it, tick it and save it.
import crypto from 'node:crypto';

export const TICK_MS = 60e3;            // one decision round per minute at most
export const BURN_MS = 3600e3;          // the Lighthouse fires every hour
export const VOTE_MS = 15 * 60e3;       // mutiny votes stay open 15 minutes
export const ANCHOR_MS = 2 * 3600e3;    // a passed vote anchors the captain for 2 hours
export const BERTHS = 24;
export const PER_PLAYER = 3;

export const STRATS = {
  privateer: { name: 'Privateer', tp: 20, sl: -9 },
  smuggler: { name: 'Smuggler', tp: 14, sl: -7 },
  merchant: { name: 'Merchant', tp: 28, sl: -14 },
  explorer: { name: 'Explorer', tp: 40, sl: -18 },
  parrot: { name: 'Parrot', tp: 25, sl: -12 },
  custom: { name: 'Custom', tp: 25, sl: -12 },
};
export const JOBS = ['cannoneer', 'quartermaster', 'cartographer'];
export const RANKS = [{ name: 'Raft', min: 0 }, { name: 'Sloop', min: 0.1 }, { name: 'Brig', min: 0.5 }, { name: 'Frigate', min: 2 }, { name: 'Galleon', min: 10 }];
const MINUS = '−';

const uid = () => crypto.randomBytes(6).toString('hex');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hashKey = k => crypto.createHash('sha256').update(String(k)).digest('hex').slice(0, 32);
const sol = v => { const a = Math.abs(v); return a >= 10 ? a.toFixed(2) : a >= 1 ? a.toFixed(3) : a.toFixed(4); };
const sgn = v => (v > 0 ? '+' : v < 0 ? MINUS : '') + sol(v);
const pct = v => (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toFixed(1) + '%';
const usd = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'k' : '$' + v.toFixed(0);
const ageStr = h => h < 1 ? Math.max(1, Math.round(h * 60)) + ' minutes' : h.toFixed(1) + ' hours';

/* ---------------- a fresh harbor ---------------- */
const HOUSE = [
  { sym: 'GULLBEARD', name: 'Capt. Gullbeard', color: '#ff8a5b', strat: 'privateer', job: 'cannoneer', fleet: 0, slots: 4, deposit: 8, hist: 11.4 },
  { sym: 'MAREE', name: 'Maré', color: '#5fd0ff', strat: 'merchant', job: 'quartermaster', fleet: 0, slots: 3, deposit: 3, hist: 2.3 },
  { sym: 'KRAKN', name: 'Old Kraken', color: '#c08bff', strat: 'smuggler', job: 'cannoneer', fleet: 1, slots: 4, deposit: 2, hist: 0.81 },
  { sym: 'RUMBOT', name: 'Rumbot', color: '#ffd166', strat: 'explorer', job: 'cartographer', fleet: 2, slots: 3, deposit: 1, hist: 0.62 },
  { sym: 'POLLY', name: 'Polly', color: '#4fdc9b', strat: 'parrot', job: 'quartermaster', fleet: 1, slots: 3, deposit: 0.5, hist: 0.18 },
  { sym: 'SEADOG', name: 'Sea Dog', color: '#ff5fa2', strat: 'privateer', job: 'quartermaster', fleet: 2, slots: 3, deposit: 0.8, hist: 0.31 },
];
function newCaptain(o) {
  return Object.assign({
    id: uid(), owner: 'the cove', ownerId: null, npc: true, pos: [], realized: 0, burned: 0, hist: 0, fees: 0, share: 30,
    paused: false, crewAnchor: false, ownerPause: false, order: null, pauseEnds: 0, mutinyAt: -30, cool: 0, maxRank: 0,
    hourTrades: 0, lastSell: null, voyage: null, lastWait: 0, state: 'ok', createdAt: Date.now(), tp: null, sl: null,
  }, o, { cash: o.deposit });
}
export function freshWorld() {
  const now = Date.now();
  const w = {
    createdAt: now, lastTick: 0, tickN: 0, pot: 0, locker: 0, flagChest: 0, nextBurn: now + BURN_MS,
    board: [], tokens: {}, index: 0, marketAt: 0,
    captains: HOUSE.map(newCaptain), events: [], tavern: [], mutiny: null, mutinyHistory: [], wrecks: [],
    fleets: [{ name: 'Salt Syndicate', color: '#5fd0ff', week: 0 }, { name: 'Black Gulls', color: '#ff8a5b', week: 0 }, { name: 'Rum Runners', color: '#ffd166', week: 0 }],
    weekStart: now, flagHolder: null, tradeTimes: [],
  };
  w.captains.forEach(c => { c.maxRank = rankIdx(c); });
  log(w, null, 'burn', 'The Lighthouse is lit. The cove is open for business.');
  return w;
}

/* ---------------- helpers ---------------- */
export const renown = c => c.hist + c.realized + c.burned;
function rankIdx(c) { const r = renown(c); let k = 0; RANKS.forEach((x, i) => { if (r >= x.min) k = i; }); return k; }
const tok = (w, id) => w.tokens[id];
export const pnlPct = (w, p) => { const t = tok(w, p.id); return t ? (t.price / p.entry - 1) * 100 : 0; };
export const equity = (w, c) => c.cash + c.pos.reduce((s, p) => { const t = tok(w, p.id); return s + (t ? p.size * t.price / p.entry : p.size); }, 0);
export const ddPct = (w, c) => (equity(w, c) / c.deposit - 1) * 100;
const alive = w => w.captains.filter(c => c.state !== 'sinking');
const leaderOf = (w, c) => alive(w).filter(x => x !== c && c.fleet >= 0 && x.fleet === c.fleet && x.strat !== 'parrot').sort((a, b) => renown(b) - renown(a))[0] || null;
function exits(c) {
  const tp = c.tp != null ? c.tp : STRATS[c.strat].tp, sl = c.sl != null ? c.sl : STRATS[c.strat].sl;
  return { tp: c.order === 'early' ? Math.max(4, Math.round(tp * 0.5)) : tp, sl };
}
export function weatherOf(index) { return index > 4 ? 'calm' : index > -3 ? 'breeze' : index > -10 ? 'storm' : 'kraken'; }

export function log(w, c, kind, text, amt = null, extra = {}) {
  const e = Object.assign({ id: uid(), t: Date.now(), cap: c ? c.id : null, sym: c ? c.sym : null, color: c ? c.color : null, kind, text, amt }, extra);
  w.events.unshift(e);
  if (w.events.length > 150) w.events.length = 150;
  if (kind === 'buy' || kind === 'sell') { w.tradeTimes.push(e.t); if (c) c.hourTrades++; }
  return e;
}
function wait(w, c, text) {
  if (Date.now() - c.lastWait < 10 * 60e3) return;
  c.lastWait = Date.now();
  log(w, c, 'wait', text);
}
function fees(w, c, size) {
  w.pot += size * 0.004;
  w.flagChest += size * 0.002;
  c.fees += size * 0.012 * (c.share / 100);
  if (c.fees < 0.002) return;
  const f = c.fees; c.fees = 0;
  if (c.job === 'cannoneer') { c.burned += f; log(w, c, 'job', `Cannon fired: bought back ${sol(f)} SOL of $${c.sym} with fee income and burned it.`, f, { neutral: true }); }
  else if (c.job === 'quartermaster') log(w, c, 'job', `Paid ${sol(f)} SOL of fee income out to my crew.`, f, { neutral: true });
  else { c.burned += f * 0.5; log(w, c, 'job', `Map room funded with ${sol(f)} SOL of fees. My crew keeps seeing my moves first.`, f, { neutral: true }); }
}

/* ---------------- trading ---------------- */
function buy(w, c, t) {
  const weather = weatherOf(w.index), { tp, sl } = exits(c);
  let size = clamp(c.deposit * 0.06, 0.01, 0.5);
  if (weather === 'storm') size *= 0.6;
  if (weather === 'kraken') size *= 0.4;
  if (c.strat === 'parrot') size *= 0.5;
  if (c.order === 'safe') size *= 0.5;
  size = Math.min(size, c.cash * 0.9);
  if (size < 0.005) return wait(w, c, `Only ${sol(c.cash)} SOL left in the hold. I wait for cargo to come home.`);
  size = +size.toFixed(4);
  if (!c.pos.length) c.voyage = { net: 0, closed: 0 };
  c.cash -= size;
  c.pos.push({ id: t.id, sym: t.sym, entry: t.price, size, at: Date.now() });
  const L = c.strat === 'parrot' ? leaderOf(w, c) : null;
  const s = sol(size), slTxt = MINUS + Math.abs(sl) + '%';
  const text = {
    privateer: `Hoisting sail on $${t.sym}: ${pct(t.ch)} this hour on ${usd(t.vol)} volume. ${s} SOL in, out at +${tp}% or ${slTxt}.`,
    smuggler: `$${t.sym} is ${pct(t.ch)} this hour and still has ${usd(t.liq)} of liquidity. Loading ${s} SOL of cheap cargo.`,
    merchant: `Steady route: $${t.sym} at ${pct(t.ch)} with ${usd(t.liq)} of depth. ${s} SOL aboard, aiming for +${tp}%.`,
    explorer: `Uncharted water: $${t.sym} is ${ageStr(t.age)} old. ${s} SOL in, out at +${tp}% or ${slTxt}.`,
    parrot: `Squawk. $${L ? L.sym : 'nobody'} holds $${t.sym}, so now I do too. ${s} SOL, half size.`,
    custom: `$${t.sym} is ${pct(t.ch)} this hour and my owner's rules say buy. ${s} SOL in, out at +${tp}% or ${slTxt}.`,
  }[c.strat];
  let note = weather === 'storm' ? ' Storm on the board, so I sized down.' : weather === 'kraken' ? ' Kraken is up, so small size.' : '';
  if (c.order === 'safe') note += ' My owner said play it safe, so half size.';
  log(w, c, 'buy', text + note, size, { coin: t.sym, coinId: t.id, neutral: true, narrate: true });
  fees(w, c, size);
}
function sell(w, c, p, msg, reason) {
  const t = tok(w, p.id), pc = pnlPct(w, p);
  const gross = p.size * (t ? t.price / p.entry : 1) - p.size;
  let tax = 0;
  if (gross > 0) { tax = gross * (c.mutinyAt === 'iron' ? 0.15 : 0.10); w.pot += tax; }
  const net = gross - tax;
  c.cash += p.size + net;
  c.realized += net;
  if (c.fleet >= 0) w.fleets[c.fleet].week += net;
  c.pos.splice(c.pos.indexOf(p), 1);
  c.lastSell = { sym: p.sym, id: p.id, pct: pc, net, exit: t ? t.price : 0 };
  c.voyage = c.voyage || { net: 0, closed: 0 };
  c.voyage.net += net; c.voyage.closed++;
  const { sl } = exits(c);
  const text = msg || (reason === 'tp'
    ? `Took profit on $${p.sym} at ${pct(pc)}. ${sgn(net)} SOL after loot tax, ${sol(tax)} SOL to the Lighthouse.`
    : `Cut $${p.sym} at ${pct(pc)}. My line is ${MINUS}${Math.abs(sl)}% and I keep it.`);
  log(w, c, 'sell', text, net, { coin: p.sym, coinId: p.id, narrate: true });
  fees(w, c, p.size);
  if (!c.pos.length) {
    const n = c.voyage.closed;
    log(w, c, 'moment', `Back in port. That voyage closed ${n} ${n === 1 ? 'position' : 'positions'} for ${sgn(c.voyage.net)} SOL.`, c.voyage.net);
    c.voyage = null;
  }
}
function candidates(w, c) {
  const held = new Set(c.pos.map(p => p.id));
  const b = w.board.filter(t => !held.has(t.id));
  switch (c.strat) {
    case 'privateer': return b.filter(t => t.ch > 8 && t.vol > 200e3 && t.age >= 3).sort((x, y) => y.ch - x.ch);
    case 'smuggler': return b.filter(t => t.ch < -10 && t.liq > 30e3).sort((x, y) => x.ch - y.ch);
    case 'merchant': return b.filter(t => t.ch > -5 && t.ch < 15 && t.liq > 100e3).sort((x, y) => y.liq - x.liq);
    case 'explorer': return b.filter(t => t.age < 3).sort((x, y) => x.age - y.age);
    case 'custom': return b.filter(t => t.ch > 0 && t.vol > 50e3).sort((x, y) => y.ch - x.ch);
    case 'parrot': { const L = leaderOf(w, c); return L ? L.pos.map(p => w.board.find(t => t.id === p.id)).filter(t => t && !held.has(t.id)) : []; }
  }
  return [];
}
function noneMsg(w, c) {
  switch (c.strat) {
    case 'privateer': return 'Nothing on the board is up 8% with over $200k of volume. I wait.';
    case 'smuggler': return `No dip deeper than ${MINUS}10% that still has $30k of depth. I wait.`;
    case 'merchant': return 'No calm route with over $100k of depth right now. I wait.';
    case 'explorer': return 'No pair younger than 3 hours on the board. I wait for a new one.';
    case 'parrot': { const L = leaderOf(w, c); return L ? `$${L.sym} has nothing new for me to copy. I wait on my perch.` : 'No captain in my fleet to copy. I wait.'; }
    default: return 'Nothing green with real volume right now. I wait.';
  }
}
function decide(w, c) {
  const { tp, sl } = exits(c);
  if (c.strat === 'parrot') {
    const L = leaderOf(w, c);
    for (const p of c.pos) if (L && !L.pos.some(q => q.id === p.id)) return sell(w, c, p, `Squawk. $${L.sym} left $${p.sym}, so I left too at ${pct(pnlPct(w, p))}.`);
  }
  for (const p of c.pos) {
    if (!tok(w, p.id)) continue;
    const pc = pnlPct(w, p);
    if (pc >= tp) return sell(w, c, p, null, 'tp');
    if (pc <= sl) return sell(w, c, p, null, 'sl');
  }
  if (equity(w, c) < c.deposit * 0.1) return sink(w, c);
  if (!w.mutiny && c.mutinyAt !== 'iron' && !c.paused && Date.now() > c.cool && ddPct(w, c) <= c.mutinyAt) return startMutiny(w, c);
  if (c.paused) return wait(w, c, c.ownerPause ? 'My owner keeps me in port. I watch the board and wait for orders.' : `The crew dropped anchor, so no new buys. I still mind ${c.pos.length} open ${c.pos.length === 1 ? 'position' : 'positions'}.`);
  if (c.pos.length >= c.slots) return wait(w, c, `All ${c.slots} slots loaded: ${c.pos.map(p => '$' + p.sym + ' ' + pct(pnlPct(w, p))).join(', ')}. No new buys until one closes.`);
  const weather = weatherOf(w.index);
  if (weather === 'kraken' && (c.strat === 'explorer' || c.strat === 'privateer' || Math.random() < 0.5)) return wait(w, c, `Kraken on the board: the average coin is ${pct(w.index)} this hour. No new cargo until it dives.`);
  if (c.order === 'safe' && c.strat === 'explorer') return wait(w, c, 'My owner said play it safe, so no brand-new pairs for now.');
  const list = candidates(w, c);
  if (!list.length) return wait(w, c, noneMsg(w, c));
  buy(w, c, list[Math.random() < 0.7 ? 0 : Math.min(1, list.length - 1)]);
}
function sink(w, c) {
  c.lastWords = (w.events.find(e => e.cap === c.id) || {}).text || 'Sails up.';
  c.state = 'sinking';
  w.wrecks.unshift({ sym: c.sym, color: c.color, when: Date.now(), dd: Math.round(ddPct(w, c)), last: c.lastWords, rk: Math.min(4, c.maxRank), x: Math.round(rnd(110, 290)), tilt: Math.random() < 0.5 ? -1 : 1 });
  log(w, c, 'sink', `Hold is under 10% of the deposit. Abandon ship: ${sol(c.cash)} SOL goes back to my owner.`);
}

/* ---------------- mutiny ---------------- */
function startMutiny(w, c) {
  w.mutiny = { id: uid(), cap: c.id, ends: Date.now() + VOTE_MS, anchor: rnd(4, 8), keep: rnd(3, 7), voters: {} };
  log(w, c, 'mutiny', `Mutiny vote opened. I'm at ${pct(ddPct(w, c))} and my line is ${MINUS}${Math.abs(c.mutinyAt)}%. The crew has 15 minutes to vote.`);
}
function mutinyStep(w) {
  const m = w.mutiny;
  if (!m) return;
  const c = w.captains.find(x => x.id === m.cap);
  if (!c || c.state === 'sinking') { w.mutiny = null; return; }
  const lean = clamp((c.mutinyAt - ddPct(w, c)) / 20, -0.5, 0.8);
  m.anchor += rnd(0, 1.5) * (1 + lean);
  m.keep += rnd(0, 1.5) * (1 - lean * 0.6);
  if (Date.now() < m.ends) return;
  w.mutiny = null;
  const a = Math.round(m.anchor / (m.anchor + m.keep) * 100);
  c.cool = Date.now() + 3 * 3600e3;
  if (m.anchor > m.keep) {
    c.paused = true; c.crewAnchor = true; c.pauseEnds = Date.now() + ANCHOR_MS;
    log(w, c, 'anchor', `Crew vote passed ${a}% to ${100 - a}%. Anchor down: no new buys for 2 hours. I still manage my open cargo.`);
    w.mutinyHistory.unshift({ sym: c.sym, color: c.color, result: 'Anchor dropped', a, t: Date.now() });
  } else {
    log(w, c, 'mutiny', `Crew vote failed: ${a}% for the anchor, ${100 - a}% against. Sails stay up, but the crew is watching.`);
    w.mutinyHistory.unshift({ sym: c.sym, color: c.color, result: 'Sails stayed up', a, t: Date.now() });
  }
  if (w.mutinyHistory.length > 20) w.mutinyHistory.length = 20;
}

/* ---------------- tavern fallback ---------------- */
export function templateBanter(w) {
  const list = alive(w);
  if (list.length < 2) return null;
  const A = pick(list), B = pick(list.filter(c => c !== A));
  const wr = w.wrecks[0];
  const o = [];
  if (B.lastSell && B.lastSell.pct < 0) o.push([`$${B.sym} cut $${B.lastSell.sym} at ${pct(B.lastSell.pct)}. Paper sails.`, `My line is my line. You'd still be holding it at ${MINUS}40%.`]);
  if (B.lastSell && B.lastSell.pct > 0) o.push([`$${B.sym} banked ${pct(B.lastSell.pct)} on $${B.lastSell.sym}. First round is on you.`, 'Already paid. 10% of it went to the Lighthouse.']);
  if (B.pos.length >= B.slots) o.push([`$${B.sym} has ${B.slots} of ${B.slots} slots loaded again. That's a cargo ship, not a pirate ship.`, wr ? `Cargo ships get home. Ask $${wr.sym} how the other way went.` : 'Cargo ships get home.']);
  if (B.strat === 'parrot') o.push([`$${B.sym} hasn't had an original thought all week.`, 'Squawk. Original thoughts are how ships end up on the seabed.']);
  if (A.strat === 'explorer') o.push(['Found a pair younger than an hour. Smells like treasure.', `Smells like a rug, $${A.sym}.`]);
  if (weatherOf(w.index) === 'storm' || weatherOf(w.index) === 'kraken') o.push([`The board is ${pct(w.index)} this hour. Who's still buying?`, B.strat === 'smuggler' ? 'Me. Dips are cargo on sale.' : 'Not me. Half size until the sky clears.']);
  if (!o.length) o.push([`$${B.sym}, your log reads like a weather report.`, 'Weather reports keep ships afloat.']);
  const [text, reply] = pick(o);
  return { from: A.sym, to: B.sym, text, reply };
}
export function addTavern(w, t) {
  const a = w.captains.find(c => c.sym === t.from), b = w.captains.find(c => c.sym === t.to);
  if (!a || !b || a === b) return;
  w.tavern.unshift({ id: uid(), t: Date.now(), a: a.id, b: b.id, text: t.text, reply: t.reply, x: false });
  if (w.tavern.length > 40) w.tavern.length = 40;
}

/* ---------------- the minute tick ---------------- */
export function tick(w, market) {
  const now = Date.now();
  w.lastTick = now; w.tickN++;
  if (market) {
    w.board = market.board;
    const tokens = {};
    for (const t of [...market.board, ...market.held]) tokens[t.id] = t;
    for (const c of w.captains) for (const p of c.pos) if (!tokens[p.id] && w.tokens[p.id]) tokens[p.id] = w.tokens[p.id];
    w.tokens = tokens;
    w.index = market.board.length ? market.board.reduce((s, t) => s + clamp(t.ch, -60, 60), 0) / market.board.length : 0;
    w.marketAt = now;
  }
  const before = w.events.length ? w.events[0].id : null;
  for (const c of w.captains) {
    if (c.state === 'sinking') continue;
    if (c.crewAnchor && now > c.pauseEnds) { c.crewAnchor = false; c.pauseEnds = 0; c.paused = c.ownerPause; log(w, c, 'sail', 'Two hours at anchor are up. Sails up.'); }
    if (market) decide(w, c);
    const k = rankIdx(c);
    if (k > c.maxRank) { c.maxRank = k; log(w, c, 'moment', `Promoted to a ${RANKS[k].name}. Renown is ${sol(renown(c))} SOL now. Bigger hull, same rules.`); }
  }
  w.captains = w.captains.filter(c => c.state !== 'sinking' || now - (w.wrecks.find(x => x.sym === c.sym) || { when: 0 }).when < 120e3);
  mutinyStep(w);
  if (now >= w.nextBurn) lighthouse(w);
  if (now - w.weekStart > 7 * 864e5) newWeek(w);
  w.tradeTimes = w.tradeTimes.filter(t => t > now - 3600e3);
  const fresh = [];
  for (const e of w.events) { if (e.id === before) break; fresh.push(e); }
  return fresh;
}
function lighthouse(w) {
  const burn = w.pot * 0.2;
  w.pot -= burn; w.locker += burn;
  const list = alive(w);
  const coh = list.reduce((b, c) => (!b || c.hourTrades > b.hourTrades) ? c : b, null);
  let tail = '';
  if (coh && coh.hourTrades > 0) {
    const bonus = Math.min(0.1, w.pot * 0.1);
    w.pot -= bonus; coh.burned += bonus;
    tail = ` Captain of the Hour is $${coh.sym} with ${coh.hourTrades} trades, so it gets a ${sol(bonus)} SOL bonus burn.`;
  }
  log(w, null, 'burn', `The Lighthouse fired: burned ${sol(burn)} SOL of $COVE into the Locker.${tail}`);
  list.forEach(c => { c.hourTrades = 0; });
  w.nextBurn = Date.now() + BURN_MS;
}
function newWeek(w) {
  const top = w.fleets.reduce((a, b) => b.week > a.week ? b : a);
  if (top.week > 0) log(w, null, 'burn', `The week is over. ${top.name} flies the Black Flag and splits ${sol(w.flagChest)} SOL from the chest.`);
  w.flagHolder = top.week > 0 ? top.name : null;
  w.flagChest = 0;
  w.fleets.forEach(f => { f.week = 0; });
  w.weekStart = Date.now();
}

/* ---------------- player actions ---------------- */
const fail = msg => ({ error: msg });
export function launch(w, ownerId, input) {
  const name = String(input.name || '').trim().slice(0, 22);
  const sym = String(input.sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const player = String(input.player || '').trim().slice(0, 20) || 'a sailor';
  const strat = STRATS[input.strat] ? input.strat : 'privateer';
  const job = JOBS.includes(input.job) ? input.job : 'cannoneer';
  const fleet = [0, 1, 2].includes(+input.fleet) ? +input.fleet : -1;
  const line = input.line === 'iron' ? 'iron' : [-20, -30, -50].includes(+input.line) ? +input.line : -30;
  const deposit = clamp(Number(input.deposit) || 1, 0.2, 10);
  const color = /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#c08bff';
  if (!name) return fail('Give your captain a name.');
  if (sym.length < 2) return fail('Tickers need 2 to 8 letters or digits.');
  if (sym === 'COVE' || w.captains.some(c => c.sym === sym) || w.wrecks.some(x => x.sym === sym)) return fail(`$${sym} is already taken in the cove. Pick another ticker.`);
  if (alive(w).length >= BERTHS) return fail('All 24 berths are taken. Try again when a captain sinks or retires.');
  if (alive(w).filter(c => c.ownerId === ownerId).length >= PER_PLAYER) return fail(`You already have ${PER_PLAYER} captains. Retire one first.`);
  if (fleet >= 0 && alive(w).filter(c => c.fleet === fleet).length >= 5) return fail(`${w.fleets[fleet].name} already has 5 ships. Pick another fleet.`);
  if (strat === 'parrot' && fleet < 0) return fail('A Parrot needs a fleet to copy. Pick a fleet.');
  const c = newCaptain({
    sym, name, color, strat, job, fleet, slots: 3, deposit, owner: player, ownerId, npc: false,
    share: clamp(Number(input.share) || 30, 10, 60), mutinyAt: line,
    tp: strat === 'custom' ? clamp(Number(input.tp) || 25, 5, 60) : null,
    sl: strat === 'custom' ? -clamp(Number(input.sl) || 12, 4, 30) : null,
  });
  w.captains.push(c);
  log(w, c, 'launch', `${name} signed the articles for ${player}. $${sym} sails with ${sol(deposit)} SOL in the hold.`);
  return { ok: true, id: c.id };
}
export function order(w, ownerId, capId, o) {
  const c = w.captains.find(x => x.id === capId);
  if (!c || c.state === 'sinking') return fail('That captain is gone.');
  if (c.ownerId !== ownerId) return fail('Only its owner can give this captain orders.');
  if (o === 'home') {
    for (const p of [...c.pos]) sell(w, c, p, `Order from my owner: come home. Sold $${p.sym} at ${pct(pnlPct(w, p))}.`);
    c.paused = true; c.ownerPause = true;
    log(w, c, 'order', 'Order from my owner: return to port. Anchored, no new trades until I hear otherwise.');
  } else if (o === 'sail') {
    if (c.crewAnchor) { w.pot += 0.1; c.crewAnchor = false; c.pauseEnds = 0; log(w, c, 'bribe', 'My owner paid a 0.1 SOL bribe into the Lighthouse to overrule the crew.', 0.1, { neutral: true }); }
    c.paused = false; c.ownerPause = false;
    log(w, c, 'order', 'Order from my owner: set sail. Back to my rules.');
  } else if (o === 'safe') { c.order = 'safe'; log(w, c, 'order', 'Order from my owner: play it safe. Half size on every new trade until told otherwise.'); }
  else if (o === 'early') { c.order = 'early'; log(w, c, 'order', `Order from my owner: take profits early. I now sell at +${exits(c).tp}%.`); }
  else if (o === 'normal') { c.order = null; log(w, c, 'order', 'Order from my owner: back to my own rules.'); }
  else if (o === 'retire') {
    for (const p of [...c.pos]) sell(w, c, p, `Retiring. Sold $${p.sym} at ${pct(pnlPct(w, p))}.`);
    log(w, c, 'moment', `Retired by my owner with ${sol(c.cash)} SOL in the hold. Fair winds, cove.`, c.cash - c.deposit);
    w.captains = w.captains.filter(x => x !== c);
    if (w.mutiny && w.mutiny.cap === c.id) w.mutiny = null;
  } else return fail('Unknown order.');
  return { ok: true };
}
export function vote(w, ownerId, side) {
  const m = w.mutiny;
  if (!m) return fail('No vote is open.');
  if (!['anchor', 'keep'].includes(side)) return fail('Vote anchor or keep.');
  if (m.voters[ownerId]) return fail('You already voted in this mutiny.');
  m.voters[ownerId] = side;
  m[side] += 3;
  return { ok: true };
}

/* ---------------- what the browser gets ---------------- */
export function publicView(w, ownerId, info) {
  const mine = new Set(w.captains.filter(c => ownerId && c.ownerId === ownerId).map(c => c.id));
  return {
    now: Date.now(), info,
    lastTick: w.lastTick, nextTick: w.lastTick + TICK_MS, pot: w.pot, locker: w.locker, flagChest: w.flagChest, flagHolder: w.flagHolder,
    nextBurn: w.nextBurn, index: w.index, weather: weatherOf(w.index), marketAt: w.marketAt,
    board: w.board, tokens: w.tokens,
    captains: w.captains.map(({ ownerId: _o, lastWait: _l, fees: _f, ...c }) => ({ ...c, mine: mine.has(c.id) })),
    events: w.events.slice(0, 80).map(({ narrate: _n, ...e }) => e),
    tavern: w.tavern.slice(0, 30), mutiny: w.mutiny && { ...w.mutiny, voters: undefined, voted: ownerId ? w.mutiny.voters[ownerId] || null : null, crew: Object.keys(w.mutiny.voters).length },
    mutinyHistory: w.mutinyHistory, wrecks: w.wrecks.slice(0, 12), fleets: w.fleets, trades1h: w.tradeTimes.filter(t => t > Date.now() - 3600e3).length,
  };
}
