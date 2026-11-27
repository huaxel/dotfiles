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
    # A self-installed copy earlier on PATH (e.g. ~/.local/bin from a tool's own
    # updater) shadows the profile binary and pins an old version silently. Only
    # list CLIs whose version must follow the flake.
    nix_managed_bins=()
    for bin in "${nix_managed_bins[@]}"; do
        resolved=$(command -v "$bin" 2>/dev/null) || continue
        resolved=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' \
            "$resolved" 2>/dev/null || echo "$resolved")
        case "$resolved" in
            /nix/store/*) ok "$bin resolves to the Nix store" ;;
            *) warn "$bin resolves to $resolved, not the Nix store — remove it so the flake owns the version" ;;
        esac
    done
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

# ── 2b. Command ownership ────────────────────────────────────────────
# The manifest is checked statically by check-macos; this catches the machine.
# An interactive zsh puts /opt/homebrew/bin ahead of ~/.nix-profile/bin, so a
# formula installed by hand (or by another agent) silently wins for the same
# command Nix already provides. Reported per formula, not per command: one
# formula owns a dozen binaries and the fix is one `brew uninstall`.
section "Command ownership"
if ! command -v brew >/dev/null 2>&1; then
    echo "  n/a (no Homebrew on this host)"
else
    brew_prefix=$(brew --prefix 2>/dev/null)
    if [ -n "$brew_prefix" ] && [ -d "$brew_prefix/bin" ] && [ -d "$HOME/.nix-profile/bin" ]; then
        while IFS=$'\t' read -r level message; do
            [ -z "${message:-}" ] && continue
            case "$level" in
                FAIL) fail "$message" ;;
                WARN) warn "$message" ;;
                OK)   ok "$message" ;;
            esac
        done < <(python3 - "$brew_prefix/bin" "$HOME/.nix-profile/bin" "$PATH" \
                    "$DOTFILES_DIR/config/Brewfile" <<'PY'
import os, re, sys

brew_bin, nix_bin, path, brewfile = sys.argv[1:5]
# Prerequisites installed before Home Manager exists; documented, deliberate.
BOOTSTRAP = {"age", "git", "sops"}

declared = set()
try:
    with open(brewfile, encoding="utf-8") as handle:
        declared = set(re.findall(r'^brew "([^"]+)"', handle.read(), re.MULTILINE))
except OSError:
    pass

def owner(entry: str) -> str | None:
    """Formula owning a Homebrew bin symlink, e.g. ../Cellar/poppler/26.11.0/bin/pdftotext."""
    try:
        target = os.path.realpath(os.path.join(brew_bin, entry))
    except OSError:
        return None
    parts = target.split(os.sep)
    for marker in ("Cellar", "opt"):
        if marker in parts:
            index = parts.index(marker)
            if index + 1 < len(parts):
                return parts[index + 1]
    return None

duplicates = set(os.listdir(brew_bin)) & set(os.listdir(nix_bin))
by_formula: dict[str, list[str]] = {}
for command in duplicates:
    formula = owner(command)
    if formula and formula not in BOOTSTRAP:
        by_formula.setdefault(formula, []).append(command)

if not by_formula:
    print("OK\tno Homebrew formula shadows a Nix-provided command")
else:
    paths = path.split(":")
    brew_first = brew_bin in paths and (nix_bin not in paths or paths.index(brew_bin) < paths.index(nix_bin))
    winner = "Homebrew's copy runs" if brew_first else "the Nix copy runs"
    for formula in sorted(by_formula):
        commands = ", ".join(sorted(by_formula[formula])[:6])
        if len(by_formula[formula]) > 6:
            commands += f" +{len(by_formula[formula]) - 6} more"
        if formula in declared:
            print(f"FAIL\tBrewfile declares {formula}, which Home Manager also owns ({commands})")
        else:
            print(f"WARN\t{formula} is installed outside the Brewfile and duplicates Nix ({commands}) - {winner}")
PY
                   )
    else
        echo "  n/a (need both a Homebrew prefix and a Nix profile)"
    fi
fi

# ── 3. Secrets ───────────────────────────────────────────────────────
section "Secrets"
key="$HOME/.config/sops/age/keys.txt"
if [ -f "$key" ]; then
    # BSD `stat -f` and GNU `stat -c` disagree, and `-f %Lp` on macOS prints
    # filesystem information instead of failing, so the old fallback chain
    # printed a file listing where the mode belonged. Ask Python once.
    perms=$(python3 -c 'import os, stat, sys
print(oct(stat.S_IMODE(os.stat(sys.argv[1]).st_mode))[2:])' "$key" 2>/dev/null || echo "?")
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

# ── 10. Sustained CPU ────────────────────────────────────────────────
# Six stale `saurex` test clients once held ~97% CPU each for two days. Nothing
# named them: `just ci` went from 112 s to 4 h 32 m and two gate runs were
# killed by timeout before `uptime` was ever read. Report, do not kill: a long
# build or a training run looks the same from here, and only the owner knows.
section "CPU"
runaway=$(python3 - <<'PY'
import os, subprocess

def seconds(etime: str) -> int:
    """`ps` etime: MM:SS, HH:MM:SS, or DD-HH:MM:SS."""
    days, _, rest = etime.rpartition("-")
    parts = [int(p) for p in rest.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    hours, minutes, secs = parts
    return (int(days) if days else 0) * 86400 + hours * 3600 + minutes * 60 + secs

rows = subprocess.run(
    ["ps", "-Ao", "uid=,pid=,etime=,pcpu=,comm="], capture_output=True, text=True
).stdout.splitlines()
for row in rows:
    fields = row.split(None, 4)
    if len(fields) < 5:
        continue
    uid, pid, etime, pcpu, comm = fields
    try:
        if int(uid) != os.getuid() or float(pcpu) < 50:
            continue
        age = seconds(etime)
    except ValueError:
        continue
    if age < 3600:
        continue
    name = os.path.basename(comm.strip())
    # `pcpu` is what it is using now, not a lifetime average: report the age
    # separately so a 35-hour-old app caught in a spin does not read as 35
    # hours of spinning.
    print(f"{name} (pid {pid}) is using {float(pcpu):.0f}% CPU, alive {age // 3600}h{age % 3600 // 60:02d}m")
PY
)
if [ -z "$runaway" ]; then
    ok "no process older than an hour is burning more than half a core"
else
    while IFS= read -r line; do warn "$line"; done <<< "$runaway"
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
