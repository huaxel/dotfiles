#!/usr/bin/env bash
# Merge a legacy pi session store into the active one, deduplicating by session UUID.
#
# Usage: merge-legacy-sessions.sh <legacy-dir> <main-dir> [--apply]
#   Without --apply it only reports what it would do (dry run).
#
# Layout-agnostic. Two store generations exist:
#   newer: <store>/--Users-x-proj--/<ts>_<uuid>.jsonl
#   older: <store>/-Projects-proj/<ts>_<uuid>.jsonl  (+ project-level subagent-artifacts/)
#
# Rule: an entry whose name contains a session UUID is a SESSION; it is copied
# whole (recursively, so nested subagent artifacts survive) unless that UUID is
# already in the main store. Any other entry is a container or artifact: it is
# copied only where the destination path does not already exist, so nothing is
# overwritten and nothing is silently dropped.
#
# Safety: never overwrites, never deletes, timestamps preserved.
set -uo pipefail

LEGACY="${1:?usage: merge-legacy-sessions.sh <legacy-dir> <main-dir> [--apply]}"
MAIN="${2:?usage: merge-legacy-sessions.sh <legacy-dir> <main-dir> [--apply]}"
APPLY=0
[[ "${3:-}" == "--apply" ]] && APPLY=1

[[ -d "$LEGACY" ]] || { echo "legacy dir not found: $LEGACY" >&2; exit 1; }
[[ -d "$MAIN" ]] || { echo "main dir not found: $MAIN" >&2; exit 1; }
[[ "$(cd "$LEGACY" && pwd -P)" != "$(cd "$MAIN" && pwd -P)" ]] || { echo "legacy and main are the same dir" >&2; exit 1; }

UUID_RE='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

uuid_of() { printf '%s' "$1" | sed -nE "s/.*_($UUID_RE)(\.jsonl)?\$/\1/p"; }

# Session UUIDs already present anywhere in the main store (entry names at depth 1-2).
{
  find "$MAIN" -mindepth 1 -maxdepth 1 -exec basename {} \;
  find "$MAIN" -mindepth 2 -maxdepth 2 -exec basename {} \;
} 2>/dev/null | sed -nE "s/.*_($UUID_RE)(\.jsonl)?\$/\1/p" | sort -u >"$TMP/main-uuids"

sess_new=0; sess_dup=0; art_new=0; art_dup=0
: >"$TMP/copied"; : >"$TMP/skipped"

do_copy() { # $1 src, $2 rel
  local src="$1" rel="$2" dest="$MAIN/$2"
  if [[ -e "$dest" ]]; then
    [[ -n "${PI_MERGE_VERBOSE:-}" ]] && echo "  skip (exists): $rel" >&2
    return 1
  fi
  [[ -n "${PI_MERGE_VERBOSE:-}" ]] && echo "  COPY: $rel" >&2
  if (( APPLY )); then
    mkdir -p "$(dirname "$dest")"
    cp -Rp "$src" "$dest" || { echo "COPY FAILED: $src" >&2; return 1; }
  fi
  printf '%s\n' "$dest" >>"$TMP/copied"
  return 0
}

handle_session() { # $1 entry, $2 rel
  local uuid; uuid="$(uuid_of "$(basename "$1")")"
  if grep -qxF "$uuid" "$TMP/main-uuids"; then
    sess_dup=$((sess_dup + 1)); printf '%s\n' "$1" >>"$TMP/skipped"; return
  fi
  if do_copy "$1" "$2"; then sess_new=$((sess_new + 1)); fi
}

handle_artifact() { # $1 entry, $2 rel
  if do_copy "$1" "$2"; then art_new=$((art_new + 1)); else art_dup=$((art_dup + 1)); fi
}

while IFS= read -r -d '' e1; do
  b1="$(basename "$e1")"; rel1="$b1"
  if [[ -n "$(uuid_of "$b1")" ]]; then
    handle_session "$e1" "$rel1"
  elif [[ -d "$e1" ]]; then
    while IFS= read -r -d '' e2; do
      b2="$(basename "$e2")"
      if [[ -n "$(uuid_of "$b2")" ]]; then
        handle_session "$e2" "$rel1/$b2"
      else
        handle_artifact "$e2" "$rel1/$b2"
      fi
    done < <(find "$e1" -mindepth 1 -maxdepth 1 -print0)
  else
    handle_artifact "$e1" "$rel1"
  fi
done < <(find "$LEGACY" -mindepth 1 -maxdepth 1 -print0)

mode="DRY RUN"; (( APPLY )) && mode="APPLIED"
echo "mode:                  $mode"
echo "legacy store:          $LEGACY"
echo "main store:            $MAIN"
echo "sessions to copy:      $sess_new"
echo "sessions already there:$sess_dup"
echo "artifacts to copy:     $art_new"
echo "artifacts already there:$art_dup"
if [[ -n "${PI_MERGE_VERBOSE:-}" ]]; then
  echo
  echo "Planned/actual copies:"
  sed 's|^|  |' "$TMP/copied"
fi

if (( APPLY )); then
  echo
  echo "Verifying copied session files parse as JSONL..."
  bad=0; checked=0
  while IFS= read -r d; do
    f="$d"; if [[ -d "$d" ]]; then f="$(find "$d" -maxdepth 1 -name '*.jsonl' | head -1)"; fi
    [[ -z "$f" || ! -f "$f" ]] && continue
    checked=$((checked + 1))
    head -c 1 "$f" | grep -q '{' || { echo "  NOT JSON: $f"; bad=$((bad + 1)); }
  done <"$TMP/copied"
  echo "  checked: $checked, invalid: $bad"
  echo
  echo "Main store now holds $(find "$MAIN" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ') top-level entries."
  echo "Legacy store left untouched at $LEGACY."
fi
