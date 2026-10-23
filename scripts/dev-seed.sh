#!/usr/bin/env bash
# Deploy every project in projects/ to the local lab started by `pnpm dev`.
# Uses the dev token from apps/api/.dev.vars.
set -euo pipefail
cd "$(dirname "$0")/.."

export LAB_API="${LAB_API:-http://localhost:8787}"
export LAB_DEPLOY_TOKEN="${LAB_DEPLOY_TOKEN:-dev-deploy-token}"

for dir in projects/*/; do
  [ -f "$dir/lab.json" ] || continue
  pnpm -s lab deploy "$dir" | grep -vE '^  [0-9]+/' || exit 1
done
