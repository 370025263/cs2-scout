# archive/

Dead scaffolding kept only for reference. Nothing here is used by the app or build.

- `index_heatmap_poc.html` + `de_dust2_map.png` — early single-map heatmap proof-of-concept, superseded by the main app.
- `fix_teams.py`, `fix_teams_correct.py` — one-off scripts that **overwrote** team labels in `scout_data.json` via spawn heuristics. `fix_teams_correct.py` had the heuristic **inverted** (it set high-Y / bomb-site spawners to T); running it is what corrupted the team field. The app now derives side from spawn position directly, so neither is needed.
- `swap_teams.py` — rewrote the Go parser source by string-replacing CT/T enum names. Never a real fix.
- `check_*.py`, `verify_*.py`, `merge_fixed.py` — debugging/diagnostic one-offs, all hardcoded to `C:\Users\BOSS\demos`.
- `e2e_test.py`, `simple_playwright_test.py`, `playwright_doubao_test.py`, `test_with_doubao_agent.py` — early Playwright/VLM test experiments referencing UI that no longer exists.
