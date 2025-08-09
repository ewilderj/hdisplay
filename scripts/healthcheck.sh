#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}/healthz"

# Fast health probe; only status code matters
curl -fsS --max-time 2 "$URL" >/dev/null
