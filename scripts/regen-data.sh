#!/usr/bin/env bash
# Regenerate scout_data.json from CS2 demo files using the Go parser.
#
#   ./scripts/regen-data.sh <demo_dir_or_file> [output.json]
#
# Requires Go >= 1.24 on PATH. Output defaults to ./scout_data.json (what the app loads).
set -euo pipefail
cd "$(dirname "$0")/.."

DEMOS="${1:?usage: scripts/regen-data.sh <demo_dir_or_file> [output.json]}"
OUT="${2:-scout_data.json}"

echo "building parser..."
( cd parse && go build -o parser . )

echo "parsing demos in: $DEMOS"
parse/parser "$DEMOS" "$OUT"
echo "done -> $OUT"
