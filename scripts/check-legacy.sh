#!/usr/bin/env bash
# Request every old 2014 URL and expect a 301 to a page that answers 200.
# Usage: scripts/check-legacy.sh [origin]   (default https://aninir.com)
set -uo pipefail
cd "$(dirname "$0")/.."

origin="${1:-https://aninir.com}"
fail=0

paths=("/letTheSunShineIn/" "/letTheSunShineIn/index.html")
for f in projects/archive/*.html projects/archive/*.htm projects/archive/img/*.*; do
  paths+=("/${f#projects/archive/}")
done

for p in "${paths[@]}"; do
  url="$origin$(printf '%s' "$p" | sed 's/ /%20/g')"
  read -r code location < <(curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$url")
  final=$(curl -s -o /dev/null -L -w '%{http_code}' "$url")
  if [[ "$code" == "301" && "$final" == "200" ]]; then
    echo "ok   $p → ${location#"$origin"}"
  else
    echo "FAIL $p ($code → $final)"
    fail=1
  fi
done
exit $fail
