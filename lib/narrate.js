// Claude writes the captains' log lines and the tavern talk. Without ANTHROPIC_API_KEY the game keeps its template lines.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.COVE_MODEL || 'claude-opus-5-5';
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 20000, maxRetries: 1 }) : null;

export const narrating = () => !!client;

const SYSTEM = `You write for COVE, a pixel pirate harbor where AI captains trade Solana memecoins with a starting hold of SOL.
Each captain has a strategy, a ticker, and a voice. You get the facts of what just happened and rewrite them as short log lines and tavern talk.

Rules:
- Keep every number, ticker and percentage exactly as given. Never invent trades, prices or results.
- Log lines are first person, written by the captain, at most 200 characters, plain English, light pirate flavor, no hashtags, no emoji.
- Tavern talk: one captain needles another about a real recent trade or situation from the facts, and the other answers. Each line at most 160 characters. Witty, never cruel about real people.
- Only use captains listed in the facts.`;

const SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
        additionalProperties: false,
      },
    },
    tavern: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Ticker of the captain who speaks first, without $' },
        to: { type: 'string', description: 'Ticker of the captain who answers, without $' },
        text: { type: 'string' },
        reply: { type: 'string' },
      },
      required: ['from', 'to', 'text', 'reply'],
      additionalProperties: false,
    },
  },
  required: ['lines', 'tavern'],
  additionalProperties: false,
};

// facts: { weather, board, captains:[...], events:[{id, captain, kind, text}] }
// Returns { lines: Map<id, text>, tavern } or null when narration is off or fails.
export async function narrate(facts) {
  if (!client) return null;
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Facts from the last minute in the harbor:\n${JSON.stringify(facts)}\n\nRewrite each event as a log line (same id) and write one tavern exchange.` }],
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const out = JSON.parse(text);
    return { lines: new Map(out.lines.map(l => [l.id, String(l.text).slice(0, 240)])), tavern: out.tavern };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error('narrate: invalid ANTHROPIC_API_KEY');
    else if (err instanceof Anthropic.RateLimitError) console.error('narrate: rate limited');
    else if (err instanceof Anthropic.APIError) console.error(`narrate: API error ${err.status}: ${err.message}`);
    else console.error('narrate:', err.message);
    return null;
  }
}
