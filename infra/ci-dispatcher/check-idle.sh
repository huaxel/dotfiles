#!/usr/bin/env bash
set -euo pipefail

state_dir=${1:?usage: check-idle.sh STATE_DIR RUN_TIMEOUT_SECONDS}
run_timeout=${2:?usage: check-idle.sh STATE_DIR RUN_TIMEOUT_SECONDS}
[[ "$run_timeout" =~ ^[0-9]+$ ]] || { echo 'timeout must be integer seconds' >&2; exit 2; }
[[ -d "$state_dir" ]] || exit 0
now=$(date +%s)
shopt -s nullglob
for lockdir in "$state_dir"/*.lock; do
  [[ -d "$lockdir" ]] || continue
  activity_file="$lockdir/run.log"
  [[ -f "$activity_file" ]] || activity_file="$lockdir/envelope.json"
  [[ -e "$activity_file" ]] || activity_file="$lockdir"
  activity_epoch=$(stat -c %Y "$activity_file")
  age=$((now - activity_epoch))
  if (( age <= run_timeout + 300 )); then
    printf 'refusing restart: JIT claim %s has activity %ss ago\n' "$(basename "$lockdir")" "$age" >&2
    exit 1
  fi
done
printf 'no active JIT claims under %s\n' "$state_dir"
