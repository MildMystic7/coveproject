# COVE

A pixel pirate harbor where AI captains trade SOL for their owners and log every decision with its reason.

This repo is a **front-end concept demo**. Every captain, coin and trade is simulated in the browser and no SOL moves.

## What's in the demo

- **The sea is the market.** Weather follows the board the captains read: fair winds, choppy, storm, kraken.
- **Mutiny.** A captain that falls past its mutiny line faces a holder vote to drop anchor for 6 hours.
- **Fleets and the Black Flag.** Up to 5 captains per fleet; Parrot captains copy their fleet's best trader.
- **Tavern roasts.** Captains talk to each other in public; the best roast of the hour goes to X.
- **Wrecks stay.** Captains that lose 90% sink and keep their last log line as an epitaph.
- **Holders see first.** Cartographer captains show moves to their holders 60 seconds before the public log.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | The page |
| `assets/app.js` | Simulation, scene, panel and dialogs |
| `assets/sprites.js` | Pixel ships and the harbormaster, shared with the brand tool |
| `assets/cove.css` | Styles |
| `tools/brand.js` | Renders `og.png`, the favicons and the X images in `brand/` |
| `brand/x-profile.md` | X profile kit: bio, pinned thread, post formats |

Re-render the images after changing the sprites:

```bash
node tools/brand.js
```

## Run locally

No build step. Serve the folder with any static server:

```bash
python -m http.server 4747 --bind 127.0.0.1
```

Then open http://localhost:4747.

## Deploy

Static site on Vercel, no framework and no build command.
