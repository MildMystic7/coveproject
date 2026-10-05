// Live Solana memecoin board from DexScreener (public API, no key).
const API = 'https://api.dexscreener.com';

async function getJSON(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`DexScreener ${res.status} for ${url}`);
  return res.json();
}

// Best pair per token: deepest liquidity, then highest volume.
function bestPairs(pairs) {
  const byToken = new Map();
  for (const p of pairs) {
    if (!p || !p.baseToken || !p.priceUsd) continue;
    const id = p.baseToken.address;
    const score = (p.liquidity?.usd || 0) * 10 + (p.volume?.h24 || 0);
    const prev = byToken.get(id);
    if (!prev || score > prev.score) byToken.set(id, { p, score });
  }
  return [...byToken.values()].map(({ p }) => ({
    id: p.baseToken.address,
    sym: (p.baseToken.symbol || '?').replace(/[^\w.$-]/g, '').slice(0, 12).toUpperCase() || '?',
    name: (p.baseToken.name || '').slice(0, 40),
    price: Number(p.priceUsd),
    ch: Number(p.priceChange?.h1 ?? 0),
    vol: Number(p.volume?.h24 ?? 0),
    liq: Number(p.liquidity?.usd ?? 0),
    age: p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3600e3 : 999,
    url: p.url,
  }));
}

async function pairsFor(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    out.push(...await getJSON(`${API}/tokens/v1/solana/${chunk.join(',')}`));
  }
  return out;
}

// Returns { board, held } where board is what captains shop from and held prices every open position.
export async function fetchMarket(heldIds = []) {
  const lists = await Promise.allSettled([
    getJSON(`${API}/token-boosts/top/v1`),
    getJSON(`${API}/token-boosts/latest/v1`),
    getJSON(`${API}/token-profiles/latest/v1`),
  ]);
  const ids = new Set();
  for (const r of lists) if (r.status === 'fulfilled' && Array.isArray(r.value)) for (const t of r.value) if (t.chainId === 'solana' && t.tokenAddress) ids.add(t.tokenAddress);
  for (const id of heldIds) ids.add(id);
  if (!ids.size) throw new Error('DexScreener returned no Solana tokens');
  const tokens = bestPairs(await pairsFor([...ids].slice(0, 90)));
  const held = new Set(heldIds);
  const tradable = tokens.filter(t => t.vol >= 20000 && t.price > 0);
  const established = tradable.filter(t => t.age >= 3).sort((a, b) => b.vol - a.vol).slice(0, 16);
  const young = tradable.filter(t => t.age < 3).sort((a, b) => a.age - b.age).slice(0, 6);
  const board = [...established, ...young];
  const onBoard = new Set(board.map(t => t.id));
  return { board, held: tokens.filter(t => held.has(t.id) && !onBoard.has(t.id)) };
}
