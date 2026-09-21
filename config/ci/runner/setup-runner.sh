#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Setup a GitHub Actions self-hosted runner on a remote
# machine. Run this FROM your main machine.
#
# Usage:
#   ./setup-runner.sh                   # interactive prompts
#   ./setup-runner.sh --host liedelpi   # specific host
#
# Requirements:
#   - SSH access to the target machine (via ~/.ssh/config or user@host)
#   - A GitHub PAT or the runner token handy
#   - The target machine: Linux (x86_64 or arm64)
# ─────────────────────────────────────────────────────────

set -euo pipefail

RUNNER_VERSION="2.325.0"

# ── Parse args ──
case "${1:-}" in
    --host) HOST="${2:-}"; ACTION="${3:-install}" ;;
    --host=*) HOST="${1#--host=}"; ACTION="${2:-install}" ;;
    *) HOST="${1:-}"; ACTION="${2:-install}" ;;
esac

if [ -z "$HOST" ]; then
    echo "Available hosts (from ~/.ssh/config):"
    grep -i '^host ' "$HOME/.ssh/config" 2>/dev/null | awk '{print "  " $2}' | grep -v '^\*$' || true
    echo ""
    echo "Usage: $0 --host <hostname> [action]"
    echo "  action: install (default) | validate | remove"
    exit 1
fi

case "$HOST" in -*|*[!a-zA-Z0-9_.@-]*) echo "  ❌ Invalid SSH host" >&2; exit 2 ;; esac
case "$ACTION" in install|validate|remove) ;; *) echo "  ❌ Invalid action: $ACTION" >&2; exit 2 ;; esac

echo "🚀 Setting up GH Actions runner on $HOST"

# ── Check SSH connectivity ──
echo "  Checking SSH connection to $HOST..."
ssh -o ConnectTimeout=5 -o BatchMode=yes "$HOST" "echo OK" || {
    echo "  ❌ Cannot reach $HOST via SSH."
    echo "     Make sure it's online and ~/.ssh/config has an entry."
    exit 1
}
echo "  ✅ SSH connected"

# ── Determine architecture ──
ARCH=$(ssh "$HOST" "uname -m")
case "$ARCH" in
    x86_64)
        RUNNER_ARCH="x64"
        RUNNER_SHA256="5020da7139d85c776059f351e0de8fdec753affc9c558e892472d43ebeb518f4"
        ;;
    aarch64)
        RUNNER_ARCH="arm64"
        RUNNER_SHA256="0e916ad0d354089d320011c132d46bdbe3353c8b925a2e1056c7c8e85d2f2490"
        ;;
    armv7l)
        RUNNER_ARCH="arm"
        RUNNER_SHA256="f74f77c6437c6de3d2921e4b26a6e2e31c21cbdeb309f86648d1f4e5fa0c3eca"
        ;;
    *)       echo "  ❌ Unsupported arch: $ARCH"; exit 1 ;;
esac
echo "  Architecture: $ARCH → runner-$RUNNER_ARCH"

OS=$(ssh "$HOST" "uname -s")
if [ "$OS" != "Linux" ]; then
    echo "  ❌ Only Linux hosts are supported (got $OS)"
    exit 1
fi

# ── Action: validate ──
if [ "$ACTION" = "validate" ]; then
    echo ""
    echo "=== Runner Status on $HOST ==="
    ssh "$HOST" "systemctl status actions.runner.* 2>/dev/null || echo 'Runner service not installed'"
    ssh "$HOST" "test -s ~/actions-runner/.runner && echo 'Runner configured' || echo 'Runner not configured'"
    echo ""
    echo "=== Available tools ==="
    ssh "$HOST" 'for cmd in just node python3 deno cargo go uv age sops git; do
        ver=$($cmd --version 2>/dev/null | head -1 || echo "not found")
        printf "  %-12s %s\n" "$cmd:" "$ver"
    done'
    exit 0
fi

# ── Action: remove ──
if [ "$ACTION" = "remove" ]; then
    echo ""
    echo "=== Removing runner from $HOST ==="
    read -r -p "  Type the host name to confirm local runner deletion: " confirmation
    [ "$confirmation" = "$HOST" ] || { echo "  Removal cancelled."; exit 1; }
    read -r -s -p "  Enter a fresh GitHub runner removal token: " REMOVE_TOKEN
    echo ""
    case "$REMOVE_TOKEN" in *[!a-zA-Z0-9_-]*|'') echo "  ❌ Invalid removal token" >&2; exit 2 ;; esac
    ssh -t "$HOST" 'cd "$HOME/actions-runner" && sudo ./svc.sh stop && sudo ./svc.sh uninstall'
    printf '%s\n' "$REMOVE_TOKEN" | ssh "$HOST" 'set -euo pipefail; cd "$HOME/actions-runner"; IFS= read -r token; ./config.sh remove --token "$token"; cd "$HOME"; rm -rf -- "$HOME/actions-runner"'
    unset REMOVE_TOKEN
    echo "  ✅ Runner removed from $HOST"
    exit 0
fi

# ── Action: install ──
echo ""
echo "=== Installing runner on $HOST ==="

# 1. Install system dependencies
echo "  Installing system dependencies..."
ssh "$HOST" 'sudo bash -c "
    if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq curl wget git jq 2>/dev/null
    elif command -v pacman &>/dev/null; then
        pacman -S --noconfirm curl wget git jq 2>/dev/null
    fi
"' || echo "  ⚡ Some packages may already be installed"

# 2. Install just (runner's only hard dependency)
echo "  Installing just..."
ssh "$HOST" bash -s -- "$RUNNER_ARCH" <<'REMOTE_JUST'
set -euo pipefail
runner_arch="$1"
if ! command -v just &>/dev/null; then
    if command -v cargo &>/dev/null; then
        cargo install just
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm just
    elif command -v brew &>/dev/null; then
        brew install just
    else
        case "$runner_arch" in
            x64) just_arch="x86_64" ;;
            arm64) just_arch="aarch64" ;;
            arm) just_arch="armv7" ;;
            *) exit 2 ;;
        esac
        tmp_dir=$(mktemp -d)
        trap 'rm -rf -- "$tmp_dir"' EXIT
        curl -fsSL "https://github.com/casey/just/releases/latest/download/just-${just_arch}-unknown-linux-musl.tar.gz" -o "$tmp_dir/just.tar.gz"
        tar -xzf "$tmp_dir/just.tar.gz" -C "$tmp_dir" just
        sudo install -m 0755 "$tmp_dir/just" /usr/local/bin/just
    fi
fi
REMOTE_JUST

# 3. Install dev tools commonly needed
echo "  Installing dev tools..."
ssh "$HOST" 'if command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm nodejs npm python python-pip deno 2>/dev/null || true
fi
# Ensure uv is available
if ! command -v uv &>/dev/null; then
    curl -fsSL https://astral.sh/uv/install.sh | sh 2>/dev/null && echo "  ✅ uv installed" || echo "  ⚡ uv install skipped"
fi
# Ensure PATH includes uv
if command -v uv &>/dev/null; then echo "  ✅ uv $(uv --version)"; fi' 2>&1 | sed 's/^/  /'

# 4. Download and configure the runner
RUNNER_DIR="actions-runner"
echo ""
echo "  === GitHub Runner Setup ==="
echo "  Go to: https://github.com/settings/actions/runners/new (org-level)"
echo "  Or:    https://github.com/YOUR_ORG/YOUR_REPO/settings/actions/runners/new (repo-level)"
echo ""
read -r -s -p "  Enter runner token: " RUNNER_TOKEN
echo ""
read -r -p "  Enter GitHub URL (org: https://github.com/YOUR_ORG, repo: https://github.com/YOUR_ORG/YOUR_REPO): " GH_URL
case "$RUNNER_TOKEN" in *[!a-zA-Z0-9_-]*|'') echo "  ❌ Invalid runner token" >&2; exit 2 ;; esac
if [[ ! "$GH_URL" =~ ^https://github\.com/[a-zA-Z0-9_.-]+(/[a-zA-Z0-9_.-]+)?$ ]]; then
    echo "  ❌ Invalid GitHub URL" >&2
    exit 2
fi

RUNNER_NAME="ci-$(ssh "$HOST" 'hostname')"
case "$RUNNER_NAME" in *[!a-zA-Z0-9_.-]*) echo "  ❌ Invalid runner name" >&2; exit 2 ;; esac

archive="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
# All interpolated values below are fixed constants or validated alphanumerics.
# shellcheck disable=SC2029
ssh "$HOST" "set -euo pipefail; cd ~; mkdir -p '$RUNNER_DIR'; cd '$RUNNER_DIR'; \
    curl -fsSLO 'https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${archive}'; \
    printf '%s  %s\\n' '$RUNNER_SHA256' '$archive' | sha256sum -c -; \
    tar xzf '$archive'; rm '$archive'"
# Feed the short-lived token over stdin instead of exposing it in the local SSH
# process arguments or shell history. GitHub's config script consumes it once.
# shellcheck disable=SC2029
printf '%s\n' "$RUNNER_TOKEN" | ssh "$HOST" "set -euo pipefail; cd ~/'$RUNNER_DIR'; IFS= read -r token; ./config.sh --url '$GH_URL' --token \"\$token\" --name '$RUNNER_NAME' --labels 'self-hosted,linux,ci' --unattended"
unset RUNNER_TOKEN

# 5. Install and start as a service
echo "  Installing runner as a service..."
ssh -t "$HOST" "cd ~/$RUNNER_DIR && sudo ./svc.sh install && sudo ./svc.sh start" 2>&1 | sed 's/^/  /'

# 6. Verify
echo "  Verifying..."
sleep 2
ssh "$HOST" "systemctl is-active actions.runner.* 2>/dev/null && echo '  ✅ Runner is running!' || echo '  ⚡ Runner service may need manual start'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Runner setup complete on $HOST"
echo ""
echo "  Next steps:"
echo "   1. Add the CI workflow to your projects:"
echo "      just project-init-ci ~/projects/my-project"
echo ""
echo "   2. Set the CI_RUNNER variable in your repo:"
echo "      GitHub repo → Settings → Secrets and variables → Actions"
echo "      → Variables → Add: CI_RUNNER = 'self-hosted,linux,ci'"
echo ""
echo "   3. Verify the runner is ready on GitHub:"
echo "      Repo → Settings → Actions → Runners"
echo ""
echo "   Validate with: ./setup-runner.sh --host $HOST validate"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
