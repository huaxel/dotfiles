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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Parse args ──
HOST="${1:-}"
ACTION="${2:-install}"  # install | validate | remove

if [ -z "$HOST" ]; then
    echo "Available hosts (from ~/.ssh/config):"
    grep -i '^host ' "$HOME/.ssh/config" 2>/dev/null | awk '{print "  " $2}' | grep -v '^\*$' || true
    echo ""
    echo "Usage: $0 --host <hostname> [action]"
    echo "  action: install (default) | validate | remove"
    exit 1
fi

HOST="${HOST#--host=}"
HOST="${HOST#--host}"

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
    x86_64)  RUNNER_ARCH="x64" ;;
    aarch64) RUNNER_ARCH="arm64" ;;
    armv7l)  RUNNER_ARCH="arm" ;;
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
    ssh "$HOST" "cat ~/actions-runner/.runner 2>/dev/null && echo 'Runner configured' || echo 'Runner not configured'"
    echo ""
    echo "=== Available tools ==="
    ssh "$HOST" 'for cmd in just node python3 deno cargo go uv age sops dotter git; do
        ver=$($cmd --version 2>/dev/null | head -1 || echo "not found")
        printf "  %-12s %s\n" "$cmd:" "$ver"
    done'
    exit 0
fi

# ── Action: remove ──
if [ "$ACTION" = "remove" ]; then
    echo ""
    echo "=== Removing runner from $HOST ==="
    ssh -t "$HOST" 'cd ~/actions-runner && sudo ./svc.sh stop 2>/dev/null; sudo ./svc.sh uninstall 2>/dev/null
    ./config.sh remove --token "$(cat .token 2>/dev/null || echo "")" 2>/dev/null || true
    cd ~ && rm -rf ~/actions-runner'
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
ssh "$HOST" 'if ! command -v just &>/dev/null; then
    if command -v cargo &>/dev/null; then
        cargo install just 2>/dev/null
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm just 2>/dev/null
    elif command -v brew &>/dev/null; then
        brew install just 2>/dev/null
    else
        curl -fsSL https://github.com/casey/just/releases/latest/download/just-x86_64-unknown-linux-musl.tar.gz | tar -xz -C /usr/local/bin just
    fi
fi'

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
read -r -p "  Enter runner token: " RUNNER_TOKEN
read -r -p "  Enter GitHub URL (org: https://github.com/YOUR_ORG, repo: https://github.com/YOUR_ORG/YOUR_REPO): " GH_URL

RUNNER_NAME="ci-$(ssh "$HOST" 'hostname')"

ssh "$HOST" "cd ~ && mkdir -p $RUNNER_DIR && cd $RUNNER_DIR && \
    curl -sSLO https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz && \
    tar xzf actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz && \
    rm actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz && \
    echo '$RUNNER_TOKEN' > .token && \
    ./config.sh --url '$GH_URL' --token '$RUNNER_TOKEN' --name '$RUNNER_NAME' --labels 'self-hosted,linux,ci' --unattended"

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
echo "      just project-init-ci path=~/projects/my-project"
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
