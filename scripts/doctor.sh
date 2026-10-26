#!/usr/bin/env bash
# just doctor — read-only health check for the CURRENT machine.
# Unlike `just ci` (repository state, same everywhere), this inspects
# machine-local state: tools, keys, env materialization, VPN, backups.
# It never changes anything: no builds, no activations, no network writes.
# Exit 0 when nothing needs attention, 1 when a ❌ item is present
# (⚠️ warnings never fail the run).
set -uo pipefail

DOTFILES_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$DOTFILES_DIR" || exit 1

failures=0
warnings=0

ok()    { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; warnings=$((warnings + 1)); }
fail()  { echo "  ❌ $*"; failures=$((failures + 1)); }
section() { echo ""; echo "=== $* ==="; }

# ── 1. Repo ──────────────────────────────────────────────────────────
section "Repo"
if ! git rev-parse --git-dir >/dev/null 2>&1; then
    fail "not a git checkout — reinstall from github.com/huaxel/dotfiles"
else
    branch=$(git branch --show-current 2>/dev/null || echo "?")
    echo "  branch: $branch ($(git log --oneline -1 | cut -c1-60))"
    if git status --porcelain 2>/dev/null | grep -qv '^??'; then
        warn "uncommitted tracked changes — commit or stash before switching profiles"
    else
        ok "worktree clean"
    fi
    if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
        behind=$(git rev-list --count HEAD..'@{u}' 2>/dev/null || echo 0)
        ahead=$(git rev-list --count '@{u}'..HEAD 2>/dev/null || echo 0)
        if [ "$behind" -gt 0 ]; then
            warn "$behind commit(s) behind upstream — run: git pull"
        elif [ "$ahead" -gt 0 ]; then
            warn "$ahead local commit(s) not pushed"
        else
            ok "in sync with upstream"
        fi
    else
        warn "no upstream tracking branch"
    fi
fi

# ── 2. Nix ───────────────────────────────────────────────────────────
section "Nix"
if ! command -v nix >/dev/null 2>&1; then
    fail "nix not installed — see README bootstrap"
else
    echo "  nix: $(nix --version | head -1)"
    case ":$PATH:" in
        *":$HOME/.nix-profile/bin:"*) ok "profile bin on PATH" ;;
        *) warn "\$HOME/.nix-profile/bin not on PATH — open a login shell" ;;
    esac
    system=$(nix eval --impure --raw --expr 'builtins.currentSystem' 2>/dev/null || echo unknown)
    case "$system" in
        aarch64-darwin) suggest="juan@macbook" ;;
        x86_64-linux)
            case "$(hostname -s 2>/dev/null)" in
                arch-wsl) suggest="juan@arch-wsl" ;;
                liedelpi*) suggest="juan@liedelpi" ;;
                *) suggest="juan@framearch" ;;
            esac ;;
        aarch64-linux) suggest="juan@liedelpi" ;;
        *) suggest="" ;;
    esac
    if [ -n "$suggest" ]; then
        echo "  system $system → profile suggestion: just nix-switch $suggest"
    else
        warn "unknown system '$system' — pick a profile from flake.nix manually"
    fi
fi

# ── 3. Secrets ───────────────────────────────────────────────────────
section "Secrets"
key="$HOME/.config/sops/age/keys.txt"
if [ -f "$key" ]; then
    perms=$(stat -f "%Lp" "$key" 2>/dev/null || stat -c "%a" "$key" 2>/dev/null || echo "?")
    if [ "$perms" = "600" ]; then ok "age key present (0600)"; else warn "age key is mode $perms, want 600"; fi
    if command -v sops >/dev/null 2>&1; then
        if sops --decrypt secrets/environment.d.enc >/dev/null 2>&1; then
            ok "sample secret decrypts"
        else
            fail "cannot decrypt secrets/environment.d.enc — wrong key? see secrets/README.md"
        fi
    else
        warn "sops not installed — skipping decrypt smoke test"
    fi
else
    fail "no age key at ~/.config/sops/age/keys.txt — restore before bootstrap"
fi

# ── 4. Shell environment ─────────────────────────────────────────────
section "Shell environment"
for f in "$HOME/.config/environment.d/10-dotfiles.conf" "$HOME/.config/environment.d/99-environment.conf"; do
    if [ -s "$f" ]; then ok "$(basename "$f") materialized ($(wc -l <"$f" | tr -d ' ') lines)";
    else fail "missing or empty: $f — Home Manager activation or secret deploy incomplete"; fi
done

# ── 5. Nushell setup ─────────────────────────────────────────────────
section "Nushell"
if ! command -v nu >/dev/null 2>&1; then
    fail "nu not installed"
elif ! scripts/nu-health.sh >/tmp/doctor-nu-health.log 2>&1; then
    fail "nu-health reported errors (see below)"; sed 's/^/    /' /tmp/doctor-nu-health.log | head -n 12
else
    ok "nu-health clean"
fi
rm -f /tmp/doctor-nu-health.log

# ── 6. Pi ────────────────────────────────────────────────────────────
section "Pi"
if [ -x bin/pi-healthcheck ]; then
    # Informational: pi-healthcheck grades cost/storage harshly by design;
    # only a hard tool failure counts against doctor.
    if bin/pi-healthcheck 2>/dev/null | tail -n 14; then
        ok "pi-healthcheck ran (see grades above; storage/cost Fs are advisory)"
    else
        fail "bin/pi-healthcheck errored — run it directly for details"
    fi
else
    warn "bin/pi-healthcheck not executable"
fi

# ── 7. Network / VPN ─────────────────────────────────────────────────
section "Network"
if command -v tailscale >/dev/null 2>&1; then
    if tailscale status --json >/dev/null 2>&1; then
        peer_count=$(tailscale status --json 2>/dev/null | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("Peer", {})))' 2>/dev/null || echo "?")
        ok "tailscale up ($peer_count peer(s))"
    else
        warn "tailscale installed but not connected — run: tailscale up"
    fi
else
    warn "tailscale not installed (needed for cross-host services)"
fi

# ── 8. WSL (only inside WSL) ─────────────────────────────────────────
if grep -qi microsoft /proc/version 2>/dev/null; then
    section "WSL"
    if scripts/wsl-vpn-setup.sh status 2>&1 | tail -n 5; then
        ok "vpn status readable (see above)"
    else
        warn "wsl-vpn-setup.sh status failed"
    fi
fi

# ── 9. Backup destination (macOS workstation path) ───────────────────
if [ "$(uname)" = "Darwin" ]; then
    section "Backup"
    if [ -d "/Volumes/KingstonPhotos" ]; then
        ok "backup volume mounted"
    else
        warn "backup volume absent — connect KingstonPhotos or run just backup-preflight to verify"
    fi
fi

# ── Summary ──────────────────────────────────────────────────────────
echo ""
if [ "$failures" -gt 0 ]; then
    echo "❌ $failures problem(s), $warnings warning(s) — see above"
    exit 1
fi
if [ "$warnings" -gt 0 ]; then
    echo "⚠️  $warnings warning(s), no blockers"
    exit 0
fi
echo "🟢  healthy"
