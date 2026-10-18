#!/usr/bin/env bash
# ci-jit-dispatcher — one lightweight poller per host that mints ephemeral
# GitHub Actions runners on demand, instead of one pet listener per repo.
#
# Modelled on the battle-tested flow in aanbestedingen's
# infra/runner-controller (queue poll -> generate-jitconfig -> single-job
# run -> teardown), minus the libvirt VM layer: this is for own-code repos
# with no outside contributors, where process-level ephemerality (fresh
# _work dir, single job, no cross-job state) is the win. VM isolation stays
# where it already exists (aanbestedingen on framearch).
#
# Requirements: bash, gh, jq, an installed actions-runner directory
# (any version; it self-updates on connect). No build step, ARM-safe.
#
# Credentials: a token file (root-owned 0600 in production) holding a
# fine-grained PAT with Actions:read + Administration:write on the listed
# repos. Passed to gh via GH_TOKEN only; environment is scrubbed before
# the runner starts so jobs can never inherit it. Minting the token is a
# HUMAN step — see README.md.
#
# Usage: jit-dispatcher.sh /path/to/config.<host>.json
set -euo pipefail

CONFIG="${1:?usage: jit-dispatcher.sh <config.json>}"

log() { printf '[jit %s] %s\n' "$(date -Is)" "$*"; }
fail() { printf '[jit] ERROR: %s\n' "$*" >&2; exit 1; }

command -v gh >/dev/null || fail "gh not found"
command -v jq >/dev/null || fail "jq not found"

RUNNER_DIR=$(jq -r '.runner_dir' "$CONFIG")
WORK_ROOT=$(jq -r '.work_root // "_work-jit"' "$CONFIG")
STATE_DIR=$(jq -r '.state_dir' "$CONFIG")
TOKEN_FILE=$(jq -r '.token_file' "$CONFIG")
NAME_PREFIX=$(jq -r '.name_prefix' "$CONFIG")
POLL_INTERVAL=$(jq -r '.poll_interval_seconds // 30' "$CONFIG")
MAX_CONCURRENT=$(jq -r '.max_concurrent // 1' "$CONFIG")
RUN_TIMEOUT=$(jq -r '.run_timeout_seconds // 3300' "$CONFIG")
DRY_RUN=$(jq -r '.dry_run // false' "$CONFIG")
MAX_ITERATIONS=$(jq -r '.max_iterations // 0' "$CONFIG")
mapfile -t OFFERED < <(jq -r '.labels[]' "$CONFIG")
mapfile -t REPOS < <(jq -r '.repos[]' "$CONFIG")
mapfile -t UNIQUE < <(jq -r '.unique_labels[] // empty' "$CONFIG")

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
if (( ! USE_AMBIENT_AUTH )); then
  [[ -f "$TOKEN_FILE" ]] || fail "token_file missing: $TOKEN_FILE (human step, see README)"
fi
mkdir -p "$STATE_DIR" "$WORK_ROOT"

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

in_flight() { ls -d "$STATE_DIR"/*.lock 2>/dev/null | wc -l; }

dispatch_for_repo() { # $1 = repo (owner/name)
  local repo="$1" run_id job runner_name jit_file lockdir workdir
  local safe="${repo//\//_}"
  lockdir="$STATE_DIR/$safe.lock"
  # Stale-lock guard: a killed dispatcher orphans its claim and would
  # deadlock this repo forever (observed live during the pilot). Locks
  # older than the run timeout + margin are reclaimed.
  if [[ -e "$lockdir" ]]; then
    if [[ -n $(find "$lockdir" -mmin +$(( (RUN_TIMEOUT + 300) / 60 )) 2>/dev/null) ]]; then
      log "stale lock for $repo, reclaiming"
      rm -rf "$lockdir"
    else
      return 0 # fresh claim: another cycle is serving this repo
    fi
  fi

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
      runner_name="$NAME_PREFIX-$safe-$(date +%s)-$RANDOM"
      jit_file="$lockdir/jit.json"
      log "$repo run $run_id: match, minting $runner_name"
      # Single mint via JSON payload (mirrors the Rust controller); the
      # response echo (name + exact label set) is validated before use.
      labels_json=$(printf '%s\n' "${OFFERED[@]}" | jq -R . | jq -s -c .)
      payload=$(jq -n --arg n "$runner_name" --argjson l "$labels_json" \
        '{name:$n, runner_group_id:1, labels:$l, work_folder:"_work"}')
      if ! echo "$payload" | GH_TOKEN="$(cat "$TOKEN_FILE")" gh api --hostname github.com \
          -H "X-GitHub-Api-Version:2022-11-28" --method POST \
          "repos/$repo/actions/runners/generate-jitconfig" --input - \
          >"$jit_file" 2>"$lockdir/mint.err"; then
        log "mint failed for $repo (see $lockdir/mint.err), releasing claim"
        rm -rf "$lockdir"; return 0
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
        rm -rf "$lockdir"; return 0
      fi
      # --jitconfig takes the base64 STRING, not a path (passing a path
      # dies with "not a valid Base-64 string", exit 0 — same trap as
      # the envelope). Controller parity: --jitconfig "$(cat .jitconfig)".
      jq -r .encoded_jit_config "$envelope" > "$jit_file" || { log "no encoded_jit_config in response"; rm -rf "$lockdir"; return 0; }
      jit_arg="$(cat "$jit_file")"
      shred -u "$jit_file" 2>/dev/null || rm -f "$jit_file"
      workdir="$WORK_ROOT/$runner_name"
      mkdir -p "$workdir"
      # Shared, content-addressed tool caches live OUTSIDE the ephemeral
      # home: ephemerality means isolated _work, not re-downloading the
      # internet per job. (Cold uv cache was the entire 30-min timeout:
      # persistent runners reuse ~/.cache/uv; fresh HOME could not.)
      # uv/pip cache dirs are lock-safe for our low concurrency.
      SHARED_CACHE="${SHARED_CACHE_DIR:-$HOME/.cache/ci-jit}"
      mkdir -p "$SHARED_CACHE/uv" "$SHARED_CACHE/pip"
      log "starting ephemeral runner $runner_name"
      # Scrubbed env: jobs must never see the minting token.
      ( cd "$RUNNER_DIR" && env -i PATH="/usr/bin:/bin:/usr/local/bin:$HOME/.nix-profile/bin" \
          HOME="$workdir" RUNNER_WORKDIR="$workdir" \
          UV_CACHE_DIR="$SHARED_CACHE/uv" PIP_CACHE_DIR="$SHARED_CACHE/pip" \
          timeout "$RUN_TIMEOUT" ./run.sh --jitconfig "$jit_arg" ) \
        >>"$lockdir/run.log" 2>&1 || log "$runner_name exited nonzero (job may still have passed; check the run)"
      rm -rf "$workdir" "$lockdir"
      log "$runner_name done, cleaned up"
      return 0
    done <<<"$matched"
  done < <(echo "$runs" | jq -r '.workflow_runs[]?.id')
}

log "up: labels [${OFFERED[*]}], repos [${REPOS[*]}], max_concurrent=$MAX_CONCURRENT dry_run=$DRY_RUN max_iterations=$MAX_ITERATIONS"
iteration=0
while true; do
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
