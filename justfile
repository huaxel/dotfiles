# ────────────────────────────────────────────────────────
# Local CI for ~/dotfiles
# Fast, self-contained, zero-dependency-on-GitHub-Actions.
# Requires: just (already installed), dotter, sops, age.
# Optional: shellcheck (brew/cargo install shellcheck),
#           deno (for TS type-checking).
# ────────────────────────────────────────────────────────

set positional-arguments := true
set shell := ["bash", "-uc"]

dotfiles-dir := `git rev-parse --show-toplevel 2>/dev/null || echo "."`

# ──────────── Installation ────────────

# Install missing CI tools (no sudo needed)
install:
    #!/usr/bin/env bash
    echo "=== Installing local CI tooling ==="
    if ! command -v shellcheck &>/dev/null; then
        if command -v cargo &>/dev/null; then
            echo "  Installing shellcheck via cargo..."; cargo install shellcheck
        elif command -v brew &>/dev/null; then
            echo "  Installing shellcheck via brew..."; brew install shellcheck
        else
            echo "  ⚠️  Install shellcheck manually: cargo install shellcheck"
        fi
    else
        echo "  ✅ shellcheck already installed"
    fi
    if ! command -v taplo &>/dev/null && command -v cargo &>/dev/null; then
        echo "  Installing taplo (TOML linter)..."
        cargo install taplo-cli 2>/dev/null || echo "  ⚡ taplo install skipped"
    fi
    echo "✓ CI tooling ready"

# ──────────── Check recipes ────────────

# Run ALL checks (the full CI pipeline)
ci: check-sh check-ts check-dotter check-secrets check-gitignore check-templates check-brewfile
    @echo ""
    @echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    @echo "  🟢  All CI checks passed!  🟢"
    @echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Alias: `just check` = `just ci`
check: ci

# ── Shell scripts ──

# Lint all shell scripts with ShellCheck
# Excludes: node_modules (npm deps), pi_npm/node_modules (pi npm deps),
#           .dotter/cache (dotter generated), and Windows .bat-styled .sh files
check-sh:
    #!/usr/bin/env bash
    echo "=== ShellCheck ==="
    if ! command -v shellcheck &>/dev/null; then
        echo "  ⚠️  shellcheck not installed — run 'just install' first"
        echo "  ⚡ Skipping shell check"
        exit 0
    fi
    count=0; errors=0
    while IFS= read -r f; do
        # Skip Windows batch files masquerading as .sh
        if grep -q '%~dp0\|%ERRORLEVEL%\|^@echo\|^rem ' "$f" 2>/dev/null; then
            continue
        fi
        if shellcheck -x -s bash "$f" 2>/dev/null; then
            count=$((count + 1))
        else
            echo "  ❌ $f has issues"
            errors=$((errors + 1))
        fi
    done < <(find . \( -path ./node_modules -o -path ./pi_npm/node_modules -o -path ./.git -o -path ./.dotter/cache \) -prune -o -type f \( -name '*.sh' -o -name '*.bash' \) -print 2>/dev/null | sort || true)
    echo "  Checked $count shell scripts"
    if [ "$errors" -gt 0 ]; then echo "  ❌ $errors files have issues"; exit 1; fi
    echo "  ✅ All shell scripts pass ShellCheck"

# ── TypeScript ──

# Syntax-check and lint pi_extension TypeScript files with deno
check-ts:
    #!/usr/bin/env bash
    echo "=== TypeScript (pi_extensions) ==="
    if ! command -v deno &>/dev/null; then
        echo "  ⚠️  deno not installed — skipping"
        exit 0
    fi
    errors=0; count=0; lint_errors=0
    TOPDIR="pi_extensions"
    # Collect all .ts files (top-level + subdirectory index.ts)
    all_files=""
    for f in "$TOPDIR"/*.ts; do [ -f "$f" ] && all_files="$all_files $f"; done
    for dir in subagent interview obs-extension; do
        f="$TOPDIR/$dir/index.ts"; [ -f "$f" ] && all_files="$all_files $f"
    done
    for f in $all_files; do
        count=$((count + 1))
        # Strong check: full type-checking
        # Some files import pi-internal packages unavailable standalone,
        # so fall back gracefully to syntax-only validation.
        if deno check "$f" 2>/dev/null; then
            : # full type check passed
        else
            # Fall back: ensure at least syntax is valid
            if deno check --no-remote --no-npm "$f" 2>/dev/null; then
                : # remote-free type check passed
            else
                # Last resort: syntax-only check
                if deno eval "import 'file://$(realpath "$f")'" 2>&1 | grep -q 'SyntaxError'; then
                    echo "  ❌ $f has syntax errors"
                    deno eval "import 'file://$(realpath "$f")'" 2>&1 | sed 's/^/    /'
                    errors=$((errors + 1))
                    continue
                fi
            fi
        fi
        # Lint check (catches unused vars, style issues)
        lint_out=$(deno lint "$f" 2>&1 || true)
        if echo "$lint_out" | grep -q "error"; then
            echo "  ⚠️  $f has lint issues"
            echo "$lint_out" | grep "error" | sed 's/^/    /'
            lint_errors=$((lint_errors + 1))
        fi
    done
    echo "  Checked $count TypeScript files"
    if [ "$errors" -gt 0 ]; then echo "  ❌ $errors files have syntax errors"; exit 1; fi
    if [ "$lint_errors" -gt 0 ]; then
        echo "  ⚠️  $lint_errors files have lint warnings (not blocking)"
    fi
    echo "  ✅ All TypeScript files pass"

# ── Dotter config ──

# Validate dotter configuration (global.toml, local.toml, templates)
check-dotter:
    #!/usr/bin/env bash
    echo "=== Dotter Configuration ==="
    if ! command -v dotter &>/dev/null; then echo "  ❌ dotter not installed"; exit 1; fi
    # 1. global.toml exists
    if [ ! -f .dotter/global.toml ]; then echo "  ❌ .dotter/global.toml missing"; exit 1; fi
    echo "  ✅ .dotter/global.toml present"
    # 2. local.toml.example exists
    if [ ! -f .dotter/local.toml.example ]; then echo "  ❌ .dotter/local.toml.example missing"; exit 1; fi
    echo "  ✅ .dotter/local.toml.example present"
    # 3. TOML lint if taplo available
    if command -v taplo &>/dev/null; then
        if taplo check .dotter/global.toml 2>/dev/null; then
            echo "  ✅ global.toml is valid TOML"
        else
            taplo check .dotter/global.toml 2>/dev/null | sed 's/^/    /'
            echo "  ❌ global.toml has TOML errors"; exit 1
        fi
    else
        echo "  ✓ global.toml exists (install taplo for TOML validation)"
    fi
    # 4. Dry-run dotter deploy (skip if no local config on this machine)
    if [ ! -f .dotter/local.toml ]; then
        echo "  ✓ dotter deploy --dry-run skipped (no local config on this machine)"
    elif output=$(dotter deploy --dry-run 2>&1); then
        changes=$(echo "$output" | grep -c "will be" 2>/dev/null || true)
        if [ "$changes" -gt 0 ] 2>/dev/null; then
            echo "  ✅ dotter deploy --dry-run OK (${changes} pending changes)"
        else
            echo "  ✅ dotter deploy --dry-run OK (up to date)"
        fi
    else
        echo "$output" | sed 's/^/    /'
        echo "  ❌ dotter deploy --dry-run failed"; exit 1
    fi
    # 5. Pre/post deploy hook syntax
    for hook in .dotter/pre_deploy.sh .dotter/post_deploy.sh; do
        if [ -f "$hook" ]; then
            if bash -n "$hook" 2>/dev/null; then
                echo "  ✅ $(basename $hook) syntax OK"
            else
                echo "  ❌ $hook has shell syntax errors"; exit 1
            fi
        fi
    done

# ── Secrets ──

# Verify encrypted secrets are consistent with current sops config
check-secrets:
    #!/usr/bin/env bash
    echo "=== Secrets ==="
    if ! command -v sops &>/dev/null; then echo "  ⚠️  sops not installed — skipping"; exit 0; fi
    errors=0; count=0
    for f in secrets/*.enc; do
        [ -f "$f" ] || continue
        count=$((count + 1))
        if ! sops --decrypt "$f" >/dev/null 2>/dev/null; then
            echo "  ❌ $f cannot be decrypted (key mismatch?)"
            errors=$((errors + 1))
        fi
    done
    echo "  Checked $count encrypted secrets"
    if [ "$errors" -gt 0 ]; then echo "  ❌ $errors secrets have issues"; exit 1; fi
    echo "  ✅ All secrets decryptable"
    # Check .sops.yaml is valid YAML
    if command -v yq &>/dev/null; then
        if yq eval . .sops.yaml >/dev/null 2>&1; then
            echo "  ✅ .sops.yaml is valid YAML"
        else
            echo "  ❌ .sops.yaml parse error"; exit 1
        fi
    elif command -v python3 &>/dev/null; then
        if python3 -c "import yaml; yaml.safe_load(open('.sops.yaml'))" 2>/dev/null; then
            echo "  ✅ .sops.yaml is valid YAML"
        else
            echo "  ❌ .sops.yaml parse error"; exit 1
        fi
    fi
    if [ -f secrets/README.md ]; then echo "  ✅ secrets/README.md present"; fi

# ── Git hygiene ──

# Check gitignore cleanliness — no tracked files that gitignore says to ignore
check-gitignore:
    #!/usr/bin/env bash
    echo "=== Git Hygiene ==="
    if ! git rev-parse --git-dir &>/dev/null; then echo "  ⚠️  Not a git repo — skipping"; exit 0; fi
    # Check for tracked files that gitignore says should be ignored
    stale=$(git ls-files -ci --exclude-standard 2>/dev/null)
    if [ -n "$stale" ]; then
        echo "  ⚠️  Stale tracked files (should be in .gitignore):"
        echo "$stale" | sed 's/^/    /'
        echo "  🔧  Run 'just fix-gitignore' to remove from tracking"
    else
        echo "  ✅ No stale tracked files"
    fi
    # Check for whitespace issues
    bad=$(git diff --check HEAD 2>/dev/null || true)
    if [ -n "$bad" ]; then echo "  ⚠️  Whitespace issues:"; echo "$bad" | sed 's/^/    /'; fi
    # Check .gitallowed present
    if [ -f .gitallowed ]; then echo "  ✅ .gitallowed present"; fi
    # Check no unencrypted secrets committed
    committed_secrets=$(git ls-files 'secrets/*' 2>/dev/null | grep -v '\.enc$' | grep -v '\.gitkeep' | grep -v 'README.md' || true)
    if [ -n "$committed_secrets" ]; then
        echo "  ❌ Unencrypted secrets tracked in git:"
        echo "$committed_secrets" | sed 's/^/    /'
        exit 1
    fi
    echo "  ✅ No unencrypted secrets in git"

# ── Template syntax ──

# Check handlebars template syntax in dotter-template files
check-templates:
    #!/usr/bin/env bash
    echo "=== Templates ==="
    errors=0
    for f in starship.toml llama-models.ini; do
        if [ ! -f "$f" ]; then continue; fi
        b_open=$(grep -o '{' "$f" 2>/dev/null | wc -l | tr -d ' ')
        b_close=$(grep -o '}' "$f" 2>/dev/null | wc -l | tr -d ' ')
        b_pairs=$((b_open / 2))
        if [ "$b_open" -ne "$b_close" ]; then
            echo "  ❌ $f: $b_open brace-opens vs $b_close brace-closes"
            errors=$((errors + 1))
        else
            echo "  ✅ $f: $b_pairs template expression(s), balanced"
        fi
    done
    if [ "$errors" -gt 0 ]; then echo "  ❌ $errors template files have issues"; exit 1; fi
    echo "  ✅ All templates balanced"

# ── Brewfile ──

# Basic Brewfile structure check
check-brewfile:
    #!/usr/bin/env bash
    echo "=== Brewfile ==="
    bf="config/Brewfile"
    if [ ! -f "$bf" ]; then echo "  ⚠️  No Brewfile found"; exit 0; fi
    lines=$(wc -l < "$bf" | tr -d ' ')
    if [ "$lines" -lt 5 ]; then echo "  ❌ Brewfile looks empty or truncated"; exit 1; fi
    echo "  ✅ Brewfile has $lines lines"
    taps=$(grep -c '^tap' "$bf" || true)
    brews=$(grep -c '^brew' "$bf" || true)
    casks=$(grep -c '^cask' "$bf" || true)
    mas=$(grep -c '^mas' "$bf" || true)
    echo "     $taps taps, $brews formulae, $casks casks, $mas mas apps"

# ── Git hooks ──

# Validate all git hook scripts have valid shell syntax
check-hooks:
    #!/usr/bin/env bash
    echo "=== Git Hooks ==="
    errors=0
    for f in .githooks/*; do
        [ -f "$f" ] || continue
        if head -1 "$f" | grep -qE '^#!.*(bash|sh)'; then
            if bash -n "$f" 2>/dev/null; then
                echo "  ✅ $(basename $f) syntax OK"
            else
                echo "  ❌ $(basename $f) has syntax errors"
                errors=$((errors + 1))
            fi
        fi
    done
    if [ "$errors" -gt 0 ]; then exit 1; fi
    echo "  ✅ All hooks valid"

# ──────────── Pre-commit ────────────

# Fast checks that run on every commit (must be <1s)
check-precommit:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== Pre-commit Checks ==="
    errors=0
    # 1. Syntax-check any staged .sh files
    while IFS= read -r f; do
        if [ -f "$f" ]; then
            if bash -n "$f" 2>/dev/null; then
                echo "  ✅ $f syntax OK"
            else
                echo "  ❌ $f has shell syntax errors"
                bash -n "$f" 2>&1 | sed 's/^/    /'
                errors=$((errors + 1))
            fi
        fi
    done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\\.(sh|bash)$' || true)
    # 2. Check no staged unencrypted secrets
    staged_secrets=$(git diff --cached --name-only -- 'secrets/*' 2>/dev/null | grep -v '\\.enc$' | grep -v '\\.gitkeep' | grep -v 'README.md' || true)
    if [ -n "$staged_secrets" ]; then
        echo "  ❌ Staged unencrypted secrets:"
        echo "$staged_secrets" | sed 's/^/    /'
        errors=$((errors + 1))
    fi
    # 3. Quick dotter validation if global.toml changed
    if git diff --cached --name-only 2>/dev/null | grep -q '.dotter/global.toml'; then
        if command -v dotter &>/dev/null; then
            if dotter deploy --dry-run >/dev/null 2>&1; then
                echo "  ✅ dotter config OK"
            else
                echo "  ❌ dotter deploy --dry-run failed"
                dotter deploy --dry-run 2>&1 | sed 's/^/    /'
                errors=$((errors + 1))
            fi
        fi
    fi
    # 4. Check for merge conflict markers in staged files
    conflicts=$(git diff --cached --name-only -G'^<<<<<<< |^=======$|^>>>>>>>' 2>/dev/null || true)
    if [ -n "$conflicts" ]; then
        echo "  ❌ Merge conflict markers found in:"
        echo "$conflicts" | sed 's/^/    /'
        errors=$((errors + 1))
    fi
    echo ""
    if [ "$errors" -gt 0 ]; then
        echo "  ❌ $errors pre-commit check(s) failed — aborting commit"
        exit 1
    fi
    echo "  ✅ Pre-commit checks passed"

# ──────────── Fix recipes ────────────

# Auto-fix common issues
fix: fix-gitignore

# Remove stale tracked files
fix-gitignore:
    #!/usr/bin/env bash
    echo "=== Fixing gitignore ==="
    stale=$(git ls-files -ci --exclude-standard 2>/dev/null)
    if [ -z "$stale" ]; then
        echo "  ✅ No stale files to fix"
        exit 0
    fi
    echo "$stale" | while IFS= read -r f; do
        echo "  Removing $f from tracking"
        git rm --cached "$f"
    done
    echo "  ✅ Removed stale files. Commit the change."
    echo "  💡  Tip: if a pattern should NOT be ignored, add it to .gitallowed"

# ──────────── Runner setup ────────────

# Setup a self-hosted GitHub Actions runner on a remote machine.
# Usage:  just runner-setup help
#         just runner-setup liedelpi install
#         just runner-setup liedelpi validate
runner-setup host="" action="install":
    bash {{dotfiles-dir}}/config/ci/runner/setup-runner.sh --host {{host}} {{action}}

# ──────────── Utility ────────────

# List all available recipes
list:
    @just --list --justfile {{justfile()}}

# Dry-run dotter deploy (preview changes without applying)
dry-run:
    dotter deploy --dry-run

# Full dotter deploy (what post-merge hook runs)
deploy:
    dotter deploy

# Info about the environment
info:
    #!/usr/bin/env bash
    echo "=== Environment ==="
    echo "  Repo:      {{dotfiles-dir}}"
    echo "  just:      $(just --version 2>/dev/null || echo 'not found')"
    echo "  dotter:    $(dotter --version 2>/dev/null || echo 'not found')"
    echo "  sops:      $(sops --version 2>/dev/null | head -1 || echo 'not found')"
    echo "  age:       $(age --version 2>/dev/null || echo 'not found')"
    echo "  shellcheck: $(command -v shellcheck 2>/dev/null && shellcheck --version 2>/dev/null | head -1 || echo 'not found')"
    echo "  deno:      $(deno --version 2>/dev/null | head -1 || echo 'not found')"
    echo "  node:      $(node --version 2>/dev/null || echo 'not found')"
    echo "  taplo:     $(taplo --version 2>/dev/null || echo 'not found')"

# ──────────── Project CI ────────────

# Run local CI on a project (uses shared template).
# Usage:  just project-ci path=~/projects/my-project
#         just project-ci   (uses current dir)
project-ci path="":
    #!/usr/bin/env bash
    CI_TEMPLATE="{{dotfiles-dir}}/config/ci/justfile"
    if [ ! -f "$CI_TEMPLATE" ]; then
        echo "  ❌ CI template not found at $CI_TEMPLATE"
        exit 1
    fi
    PROJECT="{{path}}"
    if [ -z "$PROJECT" ]; then PROJECT="$(pwd)"; fi
    if [ ! -d "$PROJECT" ]; then
        echo "  ❌ Directory not found: $PROJECT"
        exit 1
    fi
    echo "  Running CI on: $(basename $PROJECT)"
    echo ""
    exec just -f "$CI_TEMPLATE" -d "$PROJECT" ci

# Bootstrap CI into a project (creates/symlinks justfile).
# Usage:  just project-init path=~/projects/my-project [mode=link]
# Modes:  standalone (copy template), link (symlink), ghooks (link + git hooks)
project-init path="" mode="link":
    #!/usr/bin/env bash
    INIT_SCRIPT="{{dotfiles-dir}}/config/ci/init.sh"
    if [ ! -f "$INIT_SCRIPT" ]; then
        echo "  ❌ Init script not found at $INIT_SCRIPT"
        exit 1
    fi
    PROJECT="{{path}}"
    if [ -z "$PROJECT" ]; then PROJECT="$(pwd)"; fi
    if [ ! -d "$PROJECT" ]; then
        echo "  ❌ Directory not found: $PROJECT"
        exit 1
    fi
    cd "$PROJECT"
    MODE="{{mode}}"
    if [ "$MODE" = "standalone" ]; then
        bash "$INIT_SCRIPT"
    elif [ "$MODE" = "ghooks" ]; then
        bash "$INIT_SCRIPT" --gh
    else
        bash "$INIT_SCRIPT" --link
    fi

# Deploy the CI workflow (GitHub Actions) to a project.
# Usage:  just project-init-ci path=~/projects/my-project
# Creates .github/workflows/ci.yml that delegates to 'just ci'.
# Auto-detects existing GH workflows and adds as a new job.
project-init-ci path="":
    #!/usr/bin/env bash
    CI_WORKFLOW="{{dotfiles-dir}}/config/ci/.github/workflows/ci.yml"
    if [ ! -f "$CI_WORKFLOW" ]; then
        echo "  ❌ Workflow template not found at $CI_WORKFLOW"
        exit 1
    fi
    PROJECT="{{path}}"
    if [ -z "$PROJECT" ]; then PROJECT="$(pwd)"; fi
    if [ ! -d "$PROJECT" ]; then
        echo "  ❌ Directory not found: $PROJECT"
        exit 1
    fi
    GIT_DIR="$PROJECT/.git"
    if [ ! -d "$GIT_DIR" ]; then
        echo "  ⚠️  $PROJECT is not a git repo — creating workflow anyway"
    fi
    mkdir -p "$PROJECT/.github/workflows"
    TARGET="$PROJECT/.github/workflows/ci.yml"
    if [ -f "$TARGET" ]; then
        echo "  📋 $TARGET already exists — overwrite? (y/N)"
        read -r answer
        if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
            echo "  Skipped"
            exit 0
        fi
    fi
    cp "$CI_WORKFLOW" "$TARGET"
    echo "  ✅ Created $TARGET"
    echo ""
    echo "  Next: set the CI_RUNNER variable in your repo if using a self-hosted runner:"
    echo "    GitHub repo → Settings → Secrets and variables → Actions → Variables"
    echo "    Add: CI_RUNNER = 'self-hosted,linux,ci'"
