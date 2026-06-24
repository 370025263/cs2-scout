# CS2 Scout — Tactical Heatmap Analysis

Real-time Counter-Strike 2 demo replay analysis with trajectory visualization, nade tracking, and interactive timeline.

## Features

- **Player Trajectories** — Per-round movement paths with team-colored trails (CT Blue / T Orange)
- **Nade Tracking** — Smoke, HE, and Flashbang grenades with real trajectory paths, moving icons, and explosion effects
- **Interactive Timeline** — Scrub through rounds, control playback speed
- **Per-Round Team Detection** — Automatically detects halftime side-switches
- **Stats Overlay** — K/D, weapon usage, match/round counts
- **Map Filters** — Filter by map, team, toggle trails/nades/fires/kills

## Tech Stack

- **Frontend**: HTML5 Canvas, vanilla JavaScript, modern CSS Grid layout
- **Parser**: Go + [demoinfocs-golang](https://github.com/markus-wa/demoinfocs-golang) v5
- **Data**: CS2 `.dem` files parsed into `scout_data.json`

## Quick Start

```bash
cd demos
python -m http.server 8889
```

Open `http://localhost:8889/scout.html`

## Files

| File | Description |
|------|-------------|
| `scout.html` | Main tactical analysis UI |
| `index.html` | Standalone heatmap view |
| `scout_data.json` | Parsed demo data |
| `parse/main_multi.go` | Multi-demo Go parser |
| `de_dust2_radar.png` | Map radar image |
| `smoke.png` / `he_grenade.png` / `flashbang.png` | Nade icons |

## Parsing New Demos

```bash
cd parse
go build -o parser_multi.exe main_multi.go
cd ..
./parse/parser_multi.exe your_demo.dem output.json
```

## Known Issues

- CS2 demos have limited grenade trajectory data (1 point per nade); the UI interpolates 8-point paths for smooth animation
- HE/Flashbang window is very brief (16 ticks ≈ 1 second)
- Team detection is per-round based on spawn position (handles halftime correctly)

## License

MIT
