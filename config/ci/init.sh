#!/usr/bin/env bash
# Bootstrap local CI into any project.
# Usage:
#   cd ~/projects/my-project
#   ~/dotfiles/config/ci/init.sh          # create a standalone justfile
#   ~/dotfiles/config/ci/init.sh --link   # symlink to shared template
#   ~/dotfiles/config/ci/init.sh --gh     # also create .githooks/pre-commit
set -euo pipefail

CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"
MODE="${TARGET}"
[ "$MODE" = "--link" ] && MODE="link"
[ "$MODE" = "--gh" ] && MODE="ghooks"

PROJECT_DIR="$(pwd)"
JUSTFILE_TEMPLATE="$CI_DIR/justfile"

echo "🚀 Bootstrapping local CI in $PROJECT_DIR"

# ── Detect existing ──
if [ -f "$PROJECT_DIR/justfile" ] && [ "$MODE" != "force" ]; then
    if grep -q "config/ci/justfile" "$PROJECT_DIR/justfile" 2>/dev/null; then
        echo "  ✅ justfile already linked to template"
    else
        echo "  📋 Existing justfile found (override with --force)"
    fi
fi

# ── Create justfile ──
case "$MODE" in
    link)
        # Absolute path in symlink (portable across dir moves)
        ln -sf "$CI_DIR/justfile" "$PROJECT_DIR/justfile"
        echo "  ✅ Symlinked justfile → $CI_DIR/justfile"
        ;;
    ghooks|*)
        # Copy template into project
        cp "$JUSTFILE_TEMPLATE" "$PROJECT_DIR/justfile"
        echo "  ✅ Created justfile (standalone copy)"
        ;;
esac

# ── Git hooks (optional) ──
if [ "$MODE" = "ghooks" ]; then
    mkdir -p "$PROJECT_DIR/.githooks"
    cat > "$PROJECT_DIR/.githooks/pre-commit" << 'HOOK'
#!/bin/bash
set -euo pipefail
if command -v just &>/dev/null && [ -f justfile ]; then
    cd "$(git rev-parse --show-toplevel)"
    if ! just check-precommit 2>&1; then
        echo "❌ Pre-commit checks failed. Use --no-verify to skip."
        exit 1
    fi
fi
HOOK
    chmod +x "$PROJECT_DIR/.githooks/pre-commit"
    git -C "$PROJECT_DIR" config core.hooksPath .githooks 2>/dev/null || true
    echo "  ✅ Created .githooks/pre-commit and configured hooksPath"
fi

# ── Done ──
echo ""
echo "  Next steps:"
echo "    just ci               # Run all CI checks"
echo "    just info              # Show project info"
echo "    just test              # Run tests"
echo "    just lint              # Run linter"
echo "    just --list            # All available recipes"
echo ""

# Also suggest gitignore
if [ ! -f "$PROJECT_DIR/.gitignore" ]; then
    echo "  💡  Tip: create a .gitignore for this project"
fi
