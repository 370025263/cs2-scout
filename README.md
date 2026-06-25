# CS2 Scout — Tactical Analysis

Counter-Strike 2 demo replay analysis: per-round player trajectories, grenade
positions, kills/deaths, an interactive timeline, and multi-player comparison —
rendered on the map radar for scouting an opponent's tendencies.

## Run it

The app is static; it only needs to be served over HTTP (it `fetch`es `scout_data.json`):

```bash
python3 -m http.server 8889
# open http://localhost:8889/   (index.html)
```

## Project layout

```
index.html            app entry — markup only
css/scout.css         all styles
js/                   app logic, loaded in order (classic scripts, shared scope):
  core.js             constants, helpers (g2p, sideColor, teamHex, clampCam,
                      clearEffectPools), global state, canvas, keyboard + zoom/pan
  render.js           getAllRounds, the redraw() pipeline, zones, squad lines,
                      broadcast FX, heatmap
  hud.js              screen-space overlays, minimap, nade legend, end card
  entities.js         drawRound, player dots, nades (real icons), fires, kills
  data.js             buildPlayerRounds, rebuildAll, timeline events, killfeed
  ui.js               stats overlay, timeline, playback, sidebar, filters, init
assets/               de_dust2_radar.png, nade_icons/*.png
scout_data.json       parsed demo data the app loads
parse/                Go demo parser (demoinfocs-golang v5)
scripts/regen-data.sh regenerate scout_data.json from .dem files
archive/              dead scaffolding kept for reference (see archive/README.md)
```

## Regenerating data from demos

Requires Go ≥ 1.24.

```bash
./scripts/regen-data.sh <demo_dir_or_file> [output.json]   # default output: scout_data.json
# or build/run the parser directly:
parse/build.sh
parse/parser <demo_dir_or_file> scout_data.json
```

The parser emits players → matches → rounds, with per-round positions, smokes
(throw + land), flashes/HEs (throw), fires, kills and deaths, tick-normalized to
each round's start.

## Sides (CT/T)

On de_dust2, **CT spawns by the bomb sites (high world-Y, top of the radar) and T
spawns at the bottom (low world-Y)**. The app derives each round's side directly
from the spawn position, so it is correct even across halftime side-swaps and even
if a `team` label in the data is wrong. (The parser writes `team` as the first-half
side, captured at the first scored round's freezetime end — not during warmup.)

## Notes

- CS2 grenade entities are drawn at their landing point using real 2D-radar icons.
- HE/flash windows are brief (~1s); smokes show a countdown.
- Heatmaps are precomputed offscreen and cached per filter change.

## License

MIT
