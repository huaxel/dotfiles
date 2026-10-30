#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
dispatcher="$root/infra/ci-dispatcher/jit-dispatcher.sh"
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/runner" "$tmp/home" "$tmp/work"
printf 'placeholder-token\n' > "$tmp/token"
chmod 600 "$tmp/token"

cat > "$tmp/bin/gh" <<'MOCK_GH'
#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" --method POST "* ]]; then
  payload=$(cat)
  printf '%s\n' "$payload" > "$MOCK_ROOT/mint-payload.json"
  name=$(jq -r '.name' <<<"$payload")
  labels=$(jq -c '.labels | map({name: .})' <<<"$payload")
  jq -n --arg name "$name" --argjson labels "$labels" \
    '{runner:{name:$name,labels:$labels},encoded_jit_config:"Zm9v"}'
elif [[ " $* " == *"actions/runs?status=queued"* ]]; then
  printf '{"workflow_runs":[{"id":17}]}\n'
elif [[ " $* " == *"actions/runs/17/jobs"* ]]; then
  printf '{"jobs":[{"status":"queued","labels":%s}]}\n' "$MOCK_JOB_LABELS"
else
  printf '{}\n'
fi
MOCK_GH
chmod +x "$tmp/bin/gh"

cat > "$tmp/bin/sudo" <<'MOCK_SUDO'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == "-n" ]] && shift
[[ "${1:-}" == "-u" ]] || { echo 'unexpected sudo invocation' >&2; exit 2; }
shift
user=${1:?missing target user}
shift
[[ "${1:-}" == "--" ]] && shift
printf '%s\n' "$user" >> "$MOCK_ROOT/sudo-users"
exec "$@"
MOCK_SUDO
chmod +x "$tmp/bin/sudo"

# shellcheck disable=SC2016 # The generated script must expand GH_TOKEN at runtime.
printf '#!/usr/bin/env bash\nset -euo pipefail\n[[ -z "${GH_TOKEN:-}" ]]\nprintf "invoked\\n" >> "%s"\n' \
  "$tmp/runner.invoked" > "$tmp/runner/run.sh"
chmod +x "$tmp/runner/run.sh"
printf '{"repos":["example/private-repo"]}\n' > "$tmp/repos.json"

jq -n \
  --arg runner "$tmp/runner" \
  --arg work "$tmp/work" \
  --arg state "$tmp/state" \
  --arg token "$tmp/token" \
  --arg repos "$tmp/repos.json" \
  --arg cache "$tmp/cache" \
  --argjson labels '["self-hosted","linux","x64","light","jit"]' \
  --argjson unique '["light"]' \
  '{name_prefix:"test",labels:$labels,unique_labels:$unique,runner_user:"actions-runner",repos_file:$repos,runner_dir:$runner,work_root:$work,shared_cache_dir:$cache,state_dir:$state,token_file:$token,poll_interval_seconds:1,max_concurrent:1,run_timeout_seconds:5,max_iterations:1}' \
  > "$tmp/config.json"

run_dispatcher() {
  local labels=$1
  MOCK_ROOT="$tmp" MOCK_JOB_LABELS="$labels" HOME="$tmp/home" \
    PATH="$tmp/bin:$PATH" bash "$dispatcher" "$tmp/config.json"
}

# An orphan older than timeout+grace must not consume the only slot forever.
mkdir -p "$tmp/state/example_private-repo.lock"
printf '{}' > "$tmp/state/example_private-repo.lock/envelope.json"
touch -d '10 minutes ago' "$tmp/state/example_private-repo.lock" \
  "$tmp/state/example_private-repo.lock/envelope.json"
run_dispatcher '["self-hosted","linux","x64","light"]' >/dev/null
jq -e '.labels == ["self-hosted","linux","x64","light"]' "$tmp/mint-payload.json" >/dev/null
[ -f "$tmp/runner.invoked" ]
grep -qx 'actions-runner' "$tmp/sudo-users"
[ -z "$(find "$tmp/state" -mindepth 1 -maxdepth 1 -type d -name '*.lock' -print -quit)" ]
[ -z "$(find "$tmp/work" -mindepth 1 -print -quit)" ]

# A job without the host's unique label must not be minted.
rm -f "$tmp/mint-payload.json" "$tmp/runner.invoked"
run_dispatcher '["self-hosted","linux","x64"]' >/dev/null
[ ! -e "$tmp/mint-payload.json" ]
[ ! -e "$tmp/runner.invoked" ]

# Old envelope metadata cannot stale-reclaim a lock with recent job output.
mkdir -p "$tmp/state/example_private-repo.lock"
printf '{}' > "$tmp/state/example_private-repo.lock/envelope.json"
printf 'active output\n' > "$tmp/state/example_private-repo.lock/run.log"
touch -d '10 minutes ago' "$tmp/state/example_private-repo.lock/envelope.json"
run_dispatcher '["self-hosted","linux","x64","light"]' >/dev/null
[ -d "$tmp/state/example_private-repo.lock" ]
[ ! -e "$tmp/mint-payload.json" ]

printf 'CI JIT dispatcher tests passed (stale recovery, label isolation, UID handoff, cleanup)\n'
