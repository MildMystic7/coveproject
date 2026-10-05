// Load, change and save the world with optimistic retries; run the minute tick when it's due.
import { load, save, persistent } from './store.js';
import { fetchMarket } from './market.js';
import { narrate, narrating } from './narrate.js';
import { freshWorld, tick, TICK_MS, templateBanter, addTavern, RANKS, renown, ddPct, publicView, hashKey } from './world.js';

export const ownerOf = req => {
  const k = req.headers['x-cove-key'];
  return typeof k === 'string' && /^[a-f0-9]{32,64}$/.test(k) ? hashKey(k) : null;
};

async function current() {
  let cur = await load();
  if (!cur) {
    const w = freshWorld();
    const v = await save(w, 0);
    cur = v ? { data: w, version: v } : await load();
  }
  return cur;
}

// Applies fn to the latest world and saves it, retrying when another request wrote first.
export async function mutate(fn) {
  for (let i = 0; i < 4; i++) {
    const cur = await current();
    const result = fn(cur.data);
    if (result && result.skip) return { world: cur.data, result };
    if (result && result.error) return { world: cur.data, result };
    if (await save(cur.data, cur.version)) return { world: cur.data, result };
  }
  throw new Error('The harbor is busy. Try again in a moment.');
}

// Runs the minute tick if it's due. Safe to call from every request: only one request wins each minute.
export async function maybeTick(force = false) {
  const cur = await current();
  if (!force && Date.now() - cur.data.lastTick < TICK_MS) return cur.data;
  const heldIds = [...new Set(cur.data.captains.flatMap(c => c.pos.map(p => p.id)))];
  let market = null;
  try { market = await fetchMarket(heldIds); } catch (err) { console.error('market:', err.message); }

  let fresh = [];
  const { world, result } = await mutate(w => {
    if (!force && Date.now() - w.lastTick < TICK_MS) return { skip: true };
    fresh = tick(w, market);
    return { ok: true };
  });
  if (result.skip || !market) return world;

  // Second phase: Claude rewrites this minute's trade lines and writes tavern talk.
  const toNarrate = fresh.filter(e => e.narrate).slice(0, 6);
  let story = null;
  if (narrating() && (toNarrate.length || world.tickN % 3 === 0)) {
    story = await narrate({
      weather: world.index, board: world.board.slice(0, 8).map(t => ({ sym: t.sym, h1: +t.ch.toFixed(1), vol24: Math.round(t.vol) })),
      captains: world.captains.filter(c => c.state !== 'sinking').map(c => ({ sym: c.sym, name: c.name, strategy: c.strat, ship: RANKS[c.maxRank].name, sinceDeposit: +ddPct(world, c).toFixed(1), renown: +renown(c).toFixed(3), lastSell: c.lastSell && { sym: c.lastSell.sym, pct: +c.lastSell.pct.toFixed(1) } })),
      events: toNarrate.map(e => ({ id: e.id, captain: e.sym, kind: e.kind, text: e.text })),
    });
  }
  const banter = story ? story.tavern : (Math.random() < 0.35 ? templateBanter(world) : null);
  if (!story && !banter) return world;
  const done = await mutate(w => {
    if (story) for (const e of w.events) if (story.lines.has(e.id)) e.text = story.lines.get(e.id);
    if (banter) addTavern(w, banter);
    return { ok: true };
  });
  return done.world;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export const info = () => ({ persistent: persistent(), narrating: narrating() });
export { publicView };
