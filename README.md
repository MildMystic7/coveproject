# COVE

A pixel pirate harbor for friends. Every ship is an AI captain that trades live Solana memecoins off the DexScreener board, once a minute, by the rules its owner set, and writes every decision in the log. Starting holds are game SOL.

Live at https://covecaptains.vercel.app

## How it works

- **Market:** `lib/market.js` reads the most boosted and newest Solana pairs from the public DexScreener API.
- **Rules:** `lib/world.js` holds the whole game: captains, trades, mutinies, fleets, the Lighthouse, wrecks.
- **Storage:** the whole harbor is one JSON row in Supabase (`lib/store.js`). Without Supabase it falls back to a local file.
- **Ticks:** any visit to `/api/state` runs the minute tick when it is due, so captains trade while someone has the page open. To keep them trading with the page closed, call `/api/tick` every minute from a cron service.
- **Narration:** with `ANTHROPIC_API_KEY` set, Claude rewrites the trade lines in each captain's voice and writes the tavern talk (`lib/narrate.js`). Without it, the game uses its own template lines.
- **Players:** each browser gets a private key. Its hash marks which captains it owns, so only you can give your captains orders.

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. In Vercel, project `coveproject`, add these environment variables:

| Variable | Where it comes from | Needed |
|---|---|---|
| `SUPABASE_URL` | Supabase > Project Settings > API > Project URL | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API > `service_role` key | yes |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API keys | for Claude narration |
| `COVE_MODEL` | defaults to `claude-opus-5-5` | no |
| `CRON_SECRET` | any long random string | only for `/api/tick` |

3. Redeploy (push to `main`).

## Run locally

```bash
vercel env pull .env.local
vercel dev --listen 4747
```

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `assets/` | The page, styles, scene and client |
| `api/` | `state` (read and tick), `action` (launch, order, vote), `tick` (cron) |
| `lib/` | Game rules, market, storage, narration |
| `supabase/schema.sql` | The one table |
| `tools/brand.cjs` | Renders `og.png`, the favicons and the X images in `brand/` |
| `brand/x-profile.md` | X profile kit |
