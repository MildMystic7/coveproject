// POST /api/action: launch a captain, give an order, or vote in a mutiny.
import { mutate, ownerOf, publicView, send, info } from '../lib/run.js';
import { launch, order, vote } from '../lib/world.js';

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 10000) break; }
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  const owner = ownerOf(req);
  if (!owner) return send(res, 400, { error: 'Missing player key. Reload the page.' });
  const b = await body(req);
  try {
    const { world, result } = await mutate(w => {
      if (b.type === 'launch') return launch(w, owner, b);
      if (b.type === 'order') return order(w, owner, b.id, b.order);
      if (b.type === 'vote') return vote(w, owner, b.side);
      return { error: 'Unknown action.' };
    });
    if (result.error) return send(res, 400, { error: result.error });
    send(res, 200, { ...result, state: publicView(world, owner, info()) });
  } catch (err) {
    console.error('action:', err);
    send(res, 500, { error: err.message });
  }
}
