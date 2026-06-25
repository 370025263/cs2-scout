#!/usr/bin/env bash
# Build the CS2 Scout demo parser. Requires Go >= 1.24 on PATH.
#   ./build.sh            -> produces ./parser
set -euo pipefail
cd "$(dirname "$0")"
go build -o parser .
echo "built: $(pwd)/parser"
echo "usage: ./parser <demo_dir_or_file> <output.json>"
