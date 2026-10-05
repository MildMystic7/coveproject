// GET /api/tick: lets an external cron keep the harbor trading while nobody has the page open.
// Call it every minute with header `authorization: Bearer <CRON_SECRET>`.
import { maybeTick, send } from '../lib/run.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: 'Unauthorized.' });
  try {
    const w = await maybeTick();
    send(res, 200, { ok: true, tick: w.tickN, captains: w.captains.length });
  } catch (err) {
    console.error('tick:', err);
    send(res, 500, { error: err.message });
  }
}
