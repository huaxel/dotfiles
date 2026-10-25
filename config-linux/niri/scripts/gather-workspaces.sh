#!/usr/bin/env bash
# Send pinned workspaces back to their home monitors.
# Mirrors the `open-on-output` pins in ../config.kdl (niri only applies those
# at creation; Alt+Shift+Tab drifts them afterwards). 7-9 are overflow
# pinned to the primary screen (DP-4).
#
# Niri CLI references are index-or-name with bare numbers parsed as INDICES,
# so numeric names can't be addressed directly. Instead we resolve each name
# to (output, idx) from `niri msg -j workspaces` and drive everything by
# index. Focus is saved by workspace id and restored at the end.
set -euo pipefail

# workspace -> output, keep in sync with `workspace "..." { open-on-output }`.
declare -A WORKSPACE_OUTPUTS=(
  [1]="DP-4"
  [2]="HDMI-A-1"
  [3]="DP-1"
  [4]="DP-4"
  [5]="DP-4"
  [6]="DP-4"
  [7]="DP-4"
  [8]="DP-4"
  [9]="DP-4"
)

ws_json() { niri msg -j workspaces; }

focused_id=$(ws_json | jq -r '.[] | select(.is_focused) | .id')
outputs=$(niri msg -j outputs)

# Disabled outputs can remain in IPC results with logical=null.
output_connected() {
  jq -e --arg output "$1" '.[$output].logical != null' <<< "$outputs" >/dev/null
}

# Preserve the original failure status, even if restoration also fails (e.g.
# the compositor exits or the original workspace disappears during hotplug).
restore_focus() {
  local status=$? loc
  trap - EXIT
  if [[ -n "$focused_id" && "$focused_id" != null ]]; then
    if loc=$(ws_json | jq -r --argjson id "$focused_id" \
      '.[] | select(.id == $id and .output != null) | "\(.output) \(.idx)"') && [[ -n "$loc" ]]; then
      if ! { niri msg action focus-monitor "${loc% *}" >/dev/null &&
             niri msg action focus-workspace "${loc#* }" >/dev/null; }; then
        printf 'Could not restore workspace focus\n' >&2
        if (( status == 0 )); then status=1; fi
      fi
    else
      printf 'Original workspace unavailable; focus not restored\n' >&2
      if (( status == 0 )); then status=1; fi
    fi
  fi
  return "$status"
}
trap restore_focus EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for ws in 1 2 3 4 5 6 7 8 9; do
  home=${WORKSPACE_OUTPUTS[$ws]}
  if ! output_connected "$home"; then
    printf 'Skipping workspace %s: output %s is disconnected or disabled\n' "$ws" "$home" >&2
    continue
  fi
  loc=$(ws_json | jq -r --arg n "$ws" '.[] | select(.name == $n and .output != null) | "\(.output) \(.idx)"')
  [[ -n "$loc" ]] || continue
  out=${loc% *}; idx=${loc#* }
  if [[ $out != "$home" ]]; then
    niri msg action focus-monitor "$out" >/dev/null
    niri msg action focus-workspace "$idx" >/dev/null
    niri msg action move-workspace-to-monitor "$home" >/dev/null
  fi
done

# Sort each monitor's named workspaces numerically. Noctalia shows stack
# order (arrival order), so without this the bar reads scrambled even when
# everything is home. Insertion from position 1 up: previously placed slots
# 1..p-1 already hold the right names, so the wanted name is always at
# index >= p and one move per slot suffices. Unnamed empties end up last.
for mon in DP-4 HDMI-A-1 DP-1; do
  output_connected "$mon" || continue
  names=$(ws_json | jq -r --arg m "$mon" '.[] | select(.output == $m and .name != null) | .name' | sort -n)
  p=1
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    idx=$(ws_json | jq -r --arg m "$mon" --arg n "$n" '.[] | select(.output == $m and .name == $n) | "\(.idx)"')
    if [ "$idx" != "$p" ]; then
      niri msg action focus-monitor "$mon" >/dev/null
      niri msg action focus-workspace "$idx" >/dev/null
      niri msg action move-workspace-to-index "$p" >/dev/null
    fi
    p=$((p + 1))
  done <<< "$names"
done

# The EXIT trap restores original focus on success and failure.
