// GET /api/state: the harbor as the browser sees it. Advances the minute tick when it's due.
import { maybeTick, ownerOf, publicView, send, info } from '../lib/run.js';

export default async function handler(req, res) {
  try {
    const world = await maybeTick();
    send(res, 200, publicView(world, ownerOf(req), info()));
  } catch (err) {
    console.error('state:', err);
    send(res, 500, { error: 'The harbor could not be loaded. Try again in a moment.' });
  }
}
