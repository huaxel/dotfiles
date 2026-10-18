#!/usr/bin/env bash
# One-command refresh of the whole corpus, for a recurring run.
#
#   pi/agent/harness-mining/mine.sh              # every host in PI_MINE_HOSTS
#   PI_MINE_HOSTS="arch-wsl" mine.sh             # just one
#   PI_MINE_HOSTS="" mine.sh                     # local machine only
#
# Every stage fails loudly. An unreachable host would otherwise deliver an empty
# stream, and the report would keep using that host's previous records while
# looking complete.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

hosts="${PI_MINE_HOSTS-arch-wsl mac-juan}"
local_roots=(--sessions "$HOME/dotfiles/pi/agent/sessions" --sessions "$HOME/.pi/agent/sessions")
remote_roots='--sessions ~/dotfiles/pi/agent/sessions --sessions ~/.pi/agent/sessions'

echo "== local extraction =="
node extract.mjs "${local_roots[@]}" --quiet

if [ -n "${hosts// /}" ]; then
  echo "== building the single-file extractor for remote hosts =="
  bundle="$(mktemp -t harness-mining.XXXXXX.mjs)"
  trap 'rm -f "$bundle"' EXIT
  node bundle.mjs > "$bundle"

  for host in $hosts; do
    echo "== $host =="
    # shellcheck disable=SC2029 # the remote roots must expand on the remote host
    ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" \
      "node --input-type=module - --stdout --machine $host $remote_roots" \
      < "$bundle" | node ingest.mjs --expect-machine "$host"
  done
fi

echo "== report =="
node report.mjs --top 30
