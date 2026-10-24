#!/usr/bin/env bash
# Deploy the platform Workers to one environment.
# Usage: scripts/deploy-platform.sh <production|staging|dev> [api] [web] [edge]
# With no parts, deploys all three. Order is always api → web → edge, because
# web and edge bind to the API and edge binds to web.
# Secrets (LAB_DEPLOY_TOKEN, PREVIEW_TOKEN) are set once per environment, not here.
set -euo pipefail
cd "$(dirname "$0")/.."

env="${1:?usage: deploy-platform.sh <production|staging|dev> [api] [web] [edge]}"
shift
case "$env" in production | staging | dev) ;; *) echo "unknown environment: $env" >&2; exit 1 ;; esac
parts=" ${*:-api web edge} "

# Production is the top level of each wrangler config; the others are named environments.
flag=()
[ "$env" = production ] || flag=(--env "$env")

if [[ "$parts" == *" api "* ]]; then
  echo "== api ($env)"
  (cd apps/api && pnpm exec wrangler d1 migrations apply DB --remote ${flag[@]+"${flag[@]}"} && pnpm exec wrangler deploy ${flag[@]+"${flag[@]}"})
fi
if [[ "$parts" == *" web "* ]]; then
  echo "== web ($env)"
  # The Vite plugin bakes the environment into the build; deploy then uses that flattened config.
  cloudflare_env=""
  [ "$env" = production ] || cloudflare_env="$env"
  (cd apps/web && CLOUDFLARE_ENV="$cloudflare_env" pnpm exec astro build && pnpm exec wrangler deploy)
fi
if [[ "$parts" == *" edge "* ]]; then
  echo "== edge ($env)"
  (cd apps/edge && pnpm exec wrangler deploy ${flag[@]+"${flag[@]}"})
fi
