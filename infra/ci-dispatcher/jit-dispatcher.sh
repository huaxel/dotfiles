#!/usr/bin/env bash
# ci-jit-dispatcher — one lightweight poller per host that mints ephemeral
# GitHub Actions runners on demand, instead of one pet listener per repo.
#
# Modelled on the battle-tested flow in aanbestedingen's
# infra/runner-controller (queue poll -> generate-jitconfig -> single-job
# run -> teardown), minus the libvirt VM layer: this is for trusted own-code
# repos, not mutually untrusted workloads. Each job gets a fresh HOME/workdir
# and one-job registration, but the host-local runner install and tool caches
# persist intentionally. VM isolation stays where it already exists
# (aanbestedingen on framearch).
#
# Requirements: bash, gh, jq, an installed actions-runner directory
# (any version; it self-updates on connect). No build step, ARM-safe.
#
# Credentials: the dispatcher account owns a 0600 token file holding a
# fine-grained PAT with Actions:read + Administration:write on the encrypted
# host allowlist. The runner executes as a separate unprivileged account and
# cannot read the token or dispatcher state. Minting the token is a HUMAN step.
#
# Usage: jit-dispatcher.sh /path/to/config.<host>.json
set -euo pipefail
umask 077

CONFIG="${1:?usage: jit-dispatcher.sh <config.json>}"

log() { printf '[jit %s] %s\n' "$(date -Is)" "$*"; }
fail() { printf '[jit] ERROR: %s\n' "$*" >&2; exit 1; }

command -v gh >/dev/null || fail "gh not found"
command -v jq >/dev/null || fail "jq not found"
command -v sudo >/dev/null || fail "sudo not found"

RUNNER_DIR=$(jq -r '.runner_dir' "$CONFIG")
WORK_ROOT=$(jq -r '.work_root' "$CONFIG")
STATE_DIR=$(jq -r '.state_dir' "$CONFIG")
TOKEN_FILE=$(jq -r '.token_file' "$CONFIG")
RUNNER_USER=$(jq -r '.runner_user' "$CONFIG")
SHARED_CACHE_DIR=$(jq -r '.shared_cache_dir' "$CONFIG")
REPOS_FILE=$(jq -r '.repos_file' "$CONFIG")
RUNNER_PATH="/usr/local/bin:/usr/bin:/bin:/opt/ci-jit-profile/bin"
NAME_PREFIX=$(jq -r '.name_prefix' "$CONFIG")
POLL_INTERVAL=$(jq -r '.poll_interval_seconds // 30' "$CONFIG")
MAX_CONCURRENT=$(jq -r '.max_concurrent // 1' "$CONFIG")
RUN_TIMEOUT=$(jq -r '.run_timeout_seconds // 3300' "$CONFIG")
DRY_RUN=$(jq -r '.dry_run // false' "$CONFIG")
MAX_ITERATIONS=$(jq -r '.max_iterations // 0' "$CONFIG")
[[ -r "$REPOS_FILE" ]] || fail "repository allowlist missing: $REPOS_FILE"
mapfile -t OFFERED < <(jq -r '.labels[]' "$CONFIG")
mapfile -t REPOS < <(jq -r '.repos[]' "$REPOS_FILE")
mapfile -t UNIQUE < <(jq -r '.unique_labels[] // empty' "$CONFIG")
((${#REPOS[@]} > 0)) || fail "encrypted repository allowlist is missing or empty"
[[ "$RUNNER_USER" == "actions-runner" ]] || fail "runner_user must be the isolated actions-runner account"

# Dry-run (proving the poll path with zero side effects) may use ambient
# gh auth instead of a token file: DRY_RUN_AMBIENT_AUTH=1. Production
# always uses the token file; minting it stays a human step.
if [[ "$DRY_RUN" == "true" && "${DRY_RUN_AMBIENT_AUTH:-0}" == "1" ]]; then
  USE_AMBIENT_AUTH=1
  log "dry-run with ambient gh auth (no token file needed, nothing will be minted)"
else
  USE_AMBIENT_AUTH=0
fi
[[ -d "$RUNNER_DIR" ]] || fail "runner_dir missing: $RUNNER_DIR"
[[ -d "$WORK_ROOT" ]] || fail "work_root missing: $WORK_ROOT"
if (( ! USE_AMBIENT_AUTH )); then
  [[ -f "$TOKEN_FILE" ]] || fail "token_file missing: $TOKEN_FILE (human step, see README)"
fi
mkdir -p "$STATE_DIR"

# Job matches iff every label the JOB asks for is offered by THIS host,
# and the job names at least one of this host's unique labels (so a bare
# `runs-on: [self-hosted, linux]` can never be stolen by the wrong host).
job_matches() { # $1 = job JSON
  local job="$1" l
  for l in $(echo "$job" | jq -r '.labels[]'); do
    printf '%s\n' "${OFFERED[@]}" | grep -qxF "$l" || return 1
  done
  if ((${#UNIQUE[@]} > 0)); then
    for l in $(echo "$job" | jq -r '.labels[]'); do
      printf '%s\n' "${UNIQUE[@]}" | grep -qxF "$l" && return 0
    done
    return 1
  fi
  return 0
}

gh_api() { # $1 = endpoint (GET)
  if (( USE_AMBIENT_AUTH )); then
    gh api --hostname github.com \
      -H "X-GitHub-Api-Version:2022-11-28" "$1"
  else
    GH_TOKEN="$(cat "$TOKEN_FILE")" gh api --hostname github.com \
      -H "X-GitHub-Api-Version:2022-11-28" "$1"
  fi
}

in_flight() { find "$STATE_DIR" -maxdepth 1 -type d -name '*.lock' -print | wc -l; }

lock_is_stale() { # $1 = lock directory
  local lockdir="$1" activity_file activity_epoch now
  activity_file="$lockdir/run.log"
  [[ -f "$activity_file" ]] || activity_file="$lockdir/envelope.json"
  [[ -e "$activity_file" ]] || activity_file="$lockdir"
  activity_epoch=$(stat -c %Y "$activity_file") || return 1
  now=$(date +%s)
  (( now - activity_epoch > RUN_TIMEOUT + 300 ))
}

reclaim_stale_locks() {
  local lockdir
  shopt -s nullglob
  for lockdir in "$STATE_DIR"/*.lock; do
    [[ -d "$lockdir" ]] || continue
    if lock_is_stale "$lockdir"; then
      log "stale lock age exceeded run timeout for $(basename "$lockdir"), reclaiming"
      rm -rf -- "$lockdir"
    fi
  done
  shopt -u nullglob
}

ACTIVE_LOCKDIR=""
ACTIVE_WORKDIR=""
ACTIVE_RUNNER_PID=""

cleanup_active() {
  local status=$?
  trap - EXIT
  if [[ -n "$ACTIVE_RUNNER_PID" ]]; then
    kill -TERM "$ACTIVE_RUNNER_PID" 2>/dev/null || true
    wait "$ACTIVE_RUNNER_PID" 2>/dev/null || true
  fi
  if [[ -n "$ACTIVE_WORKDIR" ]]; then
    sudo -n -u "$RUNNER_USER" -- /usr/bin/chmod -R u+rwX -- "$ACTIVE_WORKDIR" 2>/dev/null || true
    sudo -n -u "$RUNNER_USER" -- /usr/bin/rm -rf -- "$ACTIVE_WORKDIR" 2>/dev/null || log "could not remove runner workdir $ACTIVE_WORKDIR"
  fi
  if [[ -n "$ACTIVE_LOCKDIR" ]]; then
    rm -rf -- "$ACTIVE_LOCKDIR" || log "could not remove claim $ACTIVE_LOCKDIR"
  fi
  return "$status"
}
trap cleanup_active EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

release_active_lock() {
  if [[ -n "$ACTIVE_LOCKDIR" ]]; then
    rm -rf -- "$ACTIVE_LOCKDIR"
    ACTIVE_LOCKDIR=""
  fi
}

dispatch_for_repo() { # $1 = repo (owner/name)
  local repo="$1" run_id job runner_name jit_file lockdir workdir
  local safe="${repo//\//_}"
  lockdir="$STATE_DIR/$safe.lock"
  # Stale claims are swept before capacity accounting. Keep a live/fresh
  # claim untouched here so a running job cannot lose its lock.
  [[ -e "$lockdir" ]] && return 0

  local runs
  runs=$(gh_api "repos/$repo/actions/runs?status=queued&per_page=5") || return 0
  while read -r run_id; do
    local jobs matched
    jobs=$(gh_api "repos/$repo/actions/runs/$run_id/jobs?per_page=20") || continue
    matched=$(echo "$jobs" | jq -c '.jobs[] | select(.status=="queued")') || continue
    while read -r job; do
      [[ -n "$job" ]] || continue
      job_matches "$job" || continue
      if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY-RUN match: repo=$repo run=$run_id labels=$(echo "$job" | jq -c '.labels') — would mint $NAME_PREFIX-$safe-<ts>-<rand>, not minting"
        return 0 # no claim, no mint, no run
      fi
      # Claim it.
      mkdir "$lockdir" 2>/dev/null || return 0
      ACTIVE_LOCKDIR="$lockdir"
      runner_name="$NAME_PREFIX-$safe-$(date +%s)-$RANDOM"
      jit_file="$lockdir/jit.json"
      log "$repo run $run_id: match, minting $runner_name"
      # Single mint via JSON payload (mirrors the Rust controller); the
      # response echo (name + exact label set) is validated before use.
      # Register only the labels the queued job requested. Advertising all
      # host labels would let an idle JIT runner take unrelated queued jobs.
      labels_json=$(echo "$job" | jq -c '.labels')
      payload=$(jq -n --arg n "$runner_name" --argjson l "$labels_json" \
        '{name:$n, runner_group_id:1, labels:$l, work_folder:"_work"}')
      if ! echo "$payload" | GH_TOKEN="$(cat "$TOKEN_FILE")" gh api --hostname github.com \
          -H "X-GitHub-Api-Version:2022-11-28" --method POST \
          "repos/$repo/actions/runners/generate-jitconfig" --input - \
          >"$jit_file" 2>"$lockdir/mint.err"; then
        log "mint failed for $repo (see $lockdir/mint.err), releasing claim"
        release_active_lock; return 0
      fi
      # NOTE: the API echoes labels as objects ({id,name,type}) with
      # canonical capitalization (Linux/ARM64). Extract .name and compare
      # case-insensitively — GitHub routing is case-insensitive too.
      # run.sh --jitconfig wants the bare base64 blob, NOT the API
      # envelope (passing the envelope dies with "not a valid Base-64
      # string" and exit 0 — silent, fast, maddening).
      envelope="$lockdir/envelope.json"
      mv "$jit_file" "$envelope"
      if ! jq -e --arg n "$runner_name" --argjson l "$labels_json" \
          '.runner.name == $n and ((.runner.labels | map(.name // . | ascii_downcase) | sort) == ($l | map(ascii_downcase) | sort))' \
          "$envelope" >/dev/null; then
        log "mint echo mismatch (name/labels), discarding without running"
        release_active_lock; return 0
      fi
      # --jitconfig takes the base64 STRING, not a path (passing a path
      # dies with "not a valid Base-64 string", exit 0 — same trap as
      # the envelope). Controller parity: --jitconfig "$(cat .jitconfig)".
      jq -er '.encoded_jit_config | select(type == "string" and length > 0)' "$envelope" > "$jit_file" || { log "no encoded_jit_config in response"; release_active_lock; return 0; }
      jit_arg="$(cat "$jit_file")"
      shred -u "$jit_file" 2>/dev/null || rm -f "$jit_file"
      rm -f -- "$envelope"
      workdir="$WORK_ROOT/$runner_name"
      ACTIVE_WORKDIR="$workdir"
      sudo -n -u "$RUNNER_USER" -- /usr/bin/mkdir -m 0700 -p -- "$workdir"
      # Shared, content-addressed tool caches live outside each ephemeral
      # HOME. They are owned by the isolated runner account, not the dispatcher.
      SHARED_CACHE="$SHARED_CACHE_DIR"
      sudo -n -u "$RUNNER_USER" -- /usr/bin/mkdir -m 0700 -p -- "$SHARED_CACHE/uv" "$SHARED_CACHE/pip"
      log "starting ephemeral runner $runner_name as $RUNNER_USER"
      # The dispatcher PAT and state are inaccessible to this separate UID.
      # /usr/local first (Unix convention): admin-installed tools must shadow
      # distro packages. The HOME remains isolated for each job.
      (
        cd "$RUNNER_DIR"
        timeout --signal=TERM --kill-after=10s "$RUN_TIMEOUT" \
          sudo -n -u "$RUNNER_USER" -- /usr/bin/env -i \
          PATH="$RUNNER_PATH" \
          HOME="$workdir" RUNNER_WORKDIR="$workdir" \
          UV_CACHE_DIR="$SHARED_CACHE/uv" PIP_CACHE_DIR="$SHARED_CACHE/pip" \
          ./run.sh --jitconfig "$jit_arg"
      ) >>"$lockdir/run.log" 2>&1 &
      ACTIVE_RUNNER_PID=$!
      runner_status=0
      wait "$ACTIVE_RUNNER_PID" || runner_status=$?
      ACTIVE_RUNNER_PID=""
      if (( runner_status != 0 )); then
        log "$runner_name exited nonzero (job may still have passed; check the run)"
      fi
      sudo -n -u "$RUNNER_USER" -- /usr/bin/chmod -R u+rwX -- "$workdir" 2>/dev/null || true
      if sudo -n -u "$RUNNER_USER" -- /usr/bin/rm -rf -- "$workdir"; then
        ACTIVE_WORKDIR=""
      else
        log "could not remove runner workdir $workdir"
      fi
      release_active_lock
      log "$runner_name done, cleaned up"
      return 0
    done <<<"$matched"
  done < <(echo "$runs" | jq -r '.workflow_runs[]?.id')
}

log "up: labels [${OFFERED[*]}], repos=${#REPOS[@]}, max_concurrent=$MAX_CONCURRENT dry_run=$DRY_RUN max_iterations=$MAX_ITERATIONS"
iteration=0
while true; do
  reclaim_stale_locks
  if (( $(in_flight) < MAX_CONCURRENT )); then
    for repo in "${REPOS[@]}"; do
      (( $(in_flight) >= MAX_CONCURRENT )) && break
      dispatch_for_repo "$repo"
    done
  fi
  iteration=$((iteration + 1))
  if (( MAX_ITERATIONS > 0 && iteration >= MAX_ITERATIONS )); then
    log "max_iterations reached ($MAX_ITERATIONS), exiting"
    exit 0
  fi
  sleep "$POLL_INTERVAL"
done
