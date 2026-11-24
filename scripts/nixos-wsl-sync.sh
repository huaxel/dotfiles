#!/usr/bin/env bash
#
# nixos-wsl-sync.sh — keep the tracked NixOS WSL system modules and the live
# distro in step.
#
# The NixOS WSL distro boots from /etc/nixos/*.nix and has no flake: its
# <nixos-wsl/modules> channel comes from the distro itself, so those files are
# the whole system configuration. They are tracked in `nixos-wsl/` so the
# system half of the host survives a vhdx loss, exactly like `deploy-windows.ps1`
# keeps the native Windows half in the repo.
#
# Modes (run on the Windows side, from the repo; nothing is installed in WSL):
#   check    fail when the repo and the live /etc/nixos disagree (CI gate)
#   diff     print a per-file comparison, always exit 0
#   push     repo -> /etc/nixos, backing up each replaced file first
#   capture  /etc/nixos -> repo, for edits made inside the distro
#
# Requires wsl.exe (Windows host). On any other platform every mode is a no-op
# with a warning, so the CI gate stays portable.
set -euo pipefail

MODE="${1:-check}"
DISTRO="${2:-NixOS}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/nixos-wsl"
REMOTE_DIR="/etc/nixos"
BACKUP_DIR="$REMOTE_DIR/.repo-backups"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}→${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

case "$MODE" in
    check | diff | push | capture) ;;
    *) err "unknown mode: $MODE (expected check|diff|push|capture)"; exit 2 ;;
esac

skip() {
    warn "$* — ${MODE} skipped"
    exit 0
}

# ── Platform gate ───────────────────────────────────────────────────────
command -v wsl.exe >/dev/null 2>&1 || skip "wsl.exe not available (not a Windows host)"
[ -d "$SRC_DIR" ] || { err "tracked module directory missing: $SRC_DIR"; exit 1; }

# `wsl -l -q` is UTF-16LE on some builds; CRLF on all of them.
distros="$(wsl.exe -l -q 2>/dev/null | tr -d '\0\r' || true)"
if ! printf '%s\n' "$distros" | grep -qx "$DISTRO"; then
    skip "WSL distro '$DISTRO' not installed"
fi

# Paths handed to wsl.exe must not be rewritten by MSYS2's argument conversion.
remote() {
    MSYS_NO_PATHCONV=1 wsl.exe --distribution "$DISTRO" --user root -- "$@"
}

remote_cat() {
    remote cat "$REMOTE_DIR/$1"
}

# Files the repo owns: every top-level *.nix in nixos-wsl/.
FILES=()
for module_path in "$SRC_DIR"/*.nix; do
    [ -e "$module_path" ] || continue
    FILES+=("$(basename "$module_path")")
done
[ "${#FILES[@]}" -gt 0 ] || { err "no *.nix modules found in $SRC_DIR"; exit 1; }

# Compare one module. Echoes same | differs | missing.
compare_file() {
    local name="$1"
    if ! remote test -f "$REMOTE_DIR/$name"; then
        echo missing
    elif remote_cat "$name" | cmp -s - "$SRC_DIR/$name"; then
        echo same
    else
        echo differs
    fi
}

report_table() {
    printf '  %-28s %s\n' "MODULE" "STATE"
    for name in "${FILES[@]}"; do
        printf '  %-28s %s\n' "$name" "$(compare_file "$name")"
    done
}

case "$MODE" in
    check)
        drift=0
        info "Comparing nixos-wsl/ with $DISTRO:$REMOTE_DIR"
        for name in "${FILES[@]}"; do
            state="$(compare_file "$name")"
            if [ "$state" != "same" ]; then
                err "$name: $state"
                drift=1
            fi
        done
        if [ "$drift" -ne 0 ]; then
            echo ""
            echo "  Run 'just nixos-wsl-diff' for the table, then either"
            echo "  'just nixos-wsl-push' (repo wins) or 'just nixos-wsl-capture'"
            echo "  (distro wins)."
            exit 1
        fi
        ok "nixos-wsl/ matches $DISTRO:$REMOTE_DIR (${#FILES[@]} modules)"
        ;;

    diff)
        report_table
        ;;

    push)
        command -v cygpath >/dev/null 2>&1 || { err "cygpath unavailable"; exit 1; }
        stamp="$(date +%Y%m%d-%H%M%S)"
        pushed=0
        for name in "${FILES[@]}"; do
            state="$(compare_file "$name")"
            if [ "$state" = "same" ]; then
                ok "$name (unchanged)"
                continue
            fi
            if [ "$state" = "differs" ]; then
                remote mkdir -p "$BACKUP_DIR/$stamp"
                remote cp -p "$REMOTE_DIR/$name" "$BACKUP_DIR/$stamp/$name"
                info "$name: live copy backed up to $BACKUP_DIR/$stamp/"
            fi
            # Normalise CRLF so a Windows checkout can never ship CRLF to Linux.
            tr -d '\r' <"$SRC_DIR/$name" | remote sh -c "cat > '$REMOTE_DIR/$name'"
            remote chmod 644 "$REMOTE_DIR/$name"
            ok "$name (written)"
            pushed=$((pushed + 1))
        done

        # Anything else in /etc/nixos is local debris, not managed here.
        extras="$(remote sh -c "cd '$REMOTE_DIR' && ls -1 *.nix 2>/dev/null" | tr -d '\r' \
            | grep -vxF -f <(printf '%s\n' "${FILES[@]}") || true)"
        if [ -n "$extras" ]; then
            warn "unmanaged files left in $REMOTE_DIR:"
            printf '%s\n' "$extras" | sed 's/^/    /'
        fi

        echo ""
        if [ "$pushed" -eq 0 ]; then
            ok "nothing to push — distro already matches the repo"
        else
            ok "$pushed module(s) pushed. Apply with:"
            echo "    wsl -d $DISTRO -u root -- nixos-rebuild switch"
        fi
        ;;

    capture)
        captured=0
        for name in "${FILES[@]}"; do
            if [ "$(compare_file "$name")" = "same" ]; then
                ok "$name (unchanged)"
                continue
            fi
            remote_cat "$name" | tr -d '\r' >"$SRC_DIR/$name"
            ok "$name (captured)"
            captured=$((captured + 1))
        done

        extras="$(remote sh -c "cd '$REMOTE_DIR' && ls -1 *.nix 2>/dev/null" | tr -d '\r' \
            | grep -vxF -f <(printf '%s\n' "${FILES[@]}") || true)"
        if [ -n "$extras" ]; then
            warn "the distro has *.nix files the repo does not track (not copied):"
            printf '%s\n' "$extras" | sed 's/^/    /'
            echo "    Copy the ones that belong in the repo into nixos-wsl/ by hand."
        fi

        echo ""
        if [ "$captured" -eq 0 ]; then
            ok "nothing to capture — repo already matches the distro"
        else
            ok "$captured module(s) captured into nixos-wsl/ — review and commit"
            echo "    git -C \"$REPO_ROOT\" diff -- nixos-wsl"
        fi
        ;;
esac
