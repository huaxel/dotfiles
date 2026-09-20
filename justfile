# ────────────────────────────────────────────────────────
# Local CI for ~/dotfiles
# Fast, self-contained, zero-dependency-on-GitHub-Actions.
# Requires: just (already installed), sops, age.
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

# Regenerate Nushell shell integrations (starship/atuin/mise/zoxide/fzf)
# after installing or upgrading those tools.
nushell-setup:
    #!/usr/bin/env bash
    if [ -x scripts/setup-nushell.sh ]; then
        scripts/setup-nushell.sh
    else
        echo "  ⚠️  scripts/setup-nushell.sh not found"
        exit 1
    fi

# ──────────── Check recipes ────────────

# Run ALL checks (the full CI pipeline)
ci: check-sh check-ts check-ts-packages test-pi-packages check-recovery check-windows check-lockfile check-secrets check-gitignore check-templates check-brewfile check-nu check-nix
    @echo ""
    @echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    @echo "  🟢  All CI checks passed!  🟢"
    @echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Alias: `just check` = `just ci`
check: ci

# CI for automation/fresh hosts: fail instead of silently skipping unavailable tools.
ci-strict:
    #!/usr/bin/env bash
    set -euo pipefail
    missing=()
    for tool in shellcheck deno sops nu nix npm node bun rsync python3; do
        command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
    done
    if [ "${#missing[@]}" -gt 0 ]; then
        echo "❌ Missing required CI tools: ${missing[*]}"
        exit 1
    fi
    exec just ci

# ── Shell scripts ──

# Lint all shell scripts with ShellCheck
# Excludes: node_modules (npm deps), pi/agent/npm/node_modules (Pi npm deps),
#           pi/agent/git, pi/agent/herdr-plugins, pi_npm/node_modules,
#           and Windows .bat-styled .sh files
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
        # Skip Markdown skill templates stored with a .sh suffix
        if head -n 1 "$f" | grep -qx -- '---'; then
            continue
        fi
        if shellcheck -x -s bash "$f" 2>/dev/null; then
            count=$((count + 1))
        else
            echo "  ❌ $f has issues"
            errors=$((errors + 1))
        fi
    done < <(find . \( -path ./node_modules -o -path ./pi/agent/npm/node_modules -o -path ./pi/agent/git -o -path ./pi/agent/herdr-plugins -o -path ./pi_npm/node_modules -o -path ./.git \) -prune -o -type f \( -name '*.sh' -o -name '*.bash' \) -print 2>/dev/null | sort || true)
    echo "  Checked $count shell scripts"
    if [ "$errors" -gt 0 ]; then echo "  ❌ $errors files have issues"; exit 1; fi
    echo "  ✅ All shell scripts pass ShellCheck"

# ── TypeScript ──

# Syntax-check and lint Pi extension TypeScript files with deno
check-ts:
    #!/usr/bin/env bash
    echo "=== TypeScript (pi/agent/extensions) ==="
    if ! command -v deno &>/dev/null; then
        echo "  ⚠️  deno not installed — skipping"
        exit 0
    fi
    errors=0; count=0; lint_errors=0
    TOPDIR="pi/agent/extensions"
    # Collect every extension source, including nested package files.
    all_files=$(find "$TOPDIR" -type f -name '*.ts' -print | sort)
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
        # Herdr owns this generated integration and overwrites it on update;
        # validate syntax above but do not lint its generated implementation.
        case "$f" in
            "$TOPDIR/herdr-agent-state.ts"|"$TOPDIR/herdr-omp-agent-state.ts")
                echo "  ↪ $f lint skipped (Herdr-managed)"
                continue
                ;;
        esac
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

# Install npm workspace deps for pi/packages/* (creates node_modules symlinks so
# shared libs like @juanbenjumea/opencode-go-usage resolve on any clone).
pi-install:
    npm install

# Sync pi extensions from the dotfiles repo to the auto-discovery dir
# (~/.pi/agent/extensions). Run after changing pi/agent/extensions/*.ts,
# or call just ci afterwards to re-lint. herdr-managed files are left alone.
pi-sync-extensions:
    #!/usr/bin/env bash
    set -euo pipefail
    src="pi/agent/extensions"
    dst="$HOME/.pi/agent/extensions"
    # If $dst is a symlink back into the dotfiles tree, the files are already
    # live there; cp would fail with "are the same file". Compare physical
    # paths and no-op instead.
    src_real=$(cd "$src" && pwd -P)
    if [ -e "$dst" ] || [ -L "$dst" ]; then
        dst_real=$(cd "$dst" 2>/dev/null && pwd -P || true)
        if [ -n "$dst_real" ] && [ "$dst_real" = "$src_real" ]; then
            echo "  ↪ $dst already points at $src — extensions are live, nothing to sync"
            exit 0
        fi
    fi
    mkdir -p "$dst"
    synced=0
    for f in "$src"/*.ts; do
        name=$(basename "$f")
        case "$name" in
            herdr-agent-state.ts|herdr-omp-agent-state.ts) echo "  ↪ skipping herdr-managed: $name"; continue ;;
        esac
        cp "$f" "$dst/$name"
        echo "  ✅ $name"
        synced=$((synced + 1))
    done
    echo "Synced $synced extensions to $dst (reload pi with /reload to pick them up)"

# Test every maintained Pi package and verify the publishable package shape.
test-pi-packages:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{dotfiles-dir}}"
    npm run typecheck --workspace @juanbenjumea/opencode-go-usage
    npm test --workspace @juanbenjumea/opencode-go-usage
    npm test --workspace pi-auto-permissions-local
    npm test --workspace @juanbenjumea/pi-ghostty-theme-sync
    npm test --workspace @juanbenjumea/pi-multi-opencode-go
    cd pi/packages/pi-multi-opencode-go
    npm pack --dry-run 2>&1 | tail -12

# Backward-compatible alias.
pi-test-multi-opencode-go: test-pi-packages

# Verify workstation backup/restore behavior with isolated fixtures.
check-recovery:
    bash scripts/tests/recovery-scripts.test.sh

# Validate Windows/WSL deployment invariants on any platform. When pwsh is
# installed, also parse every tracked PowerShell source with its native AST.
check-windows:
    #!/usr/bin/env bash
    set -euo pipefail
    python3 scripts/tests/windows-wsl-config.test.py
    if command -v pwsh >/dev/null 2>&1; then
        pwsh -NoProfile -Command '$failed=$false; Get-ChildItem bootstrap.ps1,powershell,scripts,config/llama.cpp -Recurse -Filter *.ps1 | ForEach-Object { $tokens=$null; $errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors); if($errors.Count){$failed=$true; $errors | ForEach-Object { Write-Error ("{0}: {1}" -f $_.Extent.File,$_.Message) }} }; if($failed){exit 1}'
        echo "  ✅ PowerShell sources parse"
    else
        echo "  ⚠️  pwsh unavailable — static Windows checks passed; AST parse skipped"
    fi

# Check mounted destination, encryption, keys, capacity, and session size.
backup-preflight volume="/Volumes/KingstonPhotos":
    BACKUP_VOLUME="{{volume}}" BACKUP_PREFLIGHT_ONLY=1 bash scripts/backup-to-kingston.sh

# Create a verified workstation backup on an encrypted mounted destination.
backup-workstation volume="/Volumes/KingstonPhotos":
    BACKUP_VOLUME="{{volume}}" bash scripts/backup-to-kingston.sh

# Ensure npm workspace installs remain reproducible.
check-lockfile:
    #!/usr/bin/env bash
    set -euo pipefail
    test -f package-lock.json || { echo "❌ package-lock.json is required"; exit 1; }
    node -e 'const p=require("./package-lock.json"); if (p.lockfileVersion < 3 || !p.packages?.["pi/packages/opencode-go-usage"]) process.exit(1)'
    npm ci --dry-run --ignore-scripts >/dev/null
    echo "  ✅ npm workspace lockfile is complete and synchronized"

# Publish shared usage lib first, then Pi extensions
pi-publish-opencode-go-usage:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{dotfiles-dir}}/pi/packages/opencode-go-usage"
    npm test
    npm publish --access public

# Publish order: opencode-go-usage → multi-opencode-go → dynamic-footer.
# Before publishing, flip each package's "@juanbenjumea/opencode-go-usage" dep
# from file:../opencode-go-usage to "^0.2.0" (npm accepts file: deps at publish,
# but they're broken for consumers — the published tarball keeps the relative path).
pi-publish-multi-opencode-go:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{dotfiles-dir}}/pi/packages/pi-multi-opencode-go"
    npm pack --dry-run >/dev/null
    npm publish --access public

# ── Pi packages (monorepo) ──

# Syntax-check pi/packages TypeScript
check-ts-packages:
    #!/usr/bin/env bash
    echo "=== TypeScript (pi/packages) ==="
    if ! command -v deno &>/dev/null; then
        echo "  ⚠️  deno not installed — skipping"
        exit 0
    fi
    errors=0; count=0
    for f in $(find pi/packages -type f -name '*.ts' ! -path '*/node_modules/*' -print | sort); do
        count=$((count + 1))
        if deno eval "import 'file://$(realpath "$f")'" 2>&1 | grep -q 'SyntaxError'; then
            echo "  ❌ $f has syntax errors"
            errors=$((errors + 1))
        fi
    done
    echo "  Checked $count package TypeScript files"
    if [ "$errors" -gt 0 ]; then exit 1; fi
    echo "  ✅ All package TypeScript files pass"

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
    if command -v yq &>/dev/null; then
        if yq . .sops.yaml >/dev/null 2>&1; then
            echo "  ✅ .sops.yaml is valid YAML"
        else
            echo "  ❌ .sops.yaml parse error"; exit 1
        fi
    elif command -v python3 &>/dev/null && python3 -c "import yaml" >/dev/null 2>&1; then
        if python3 -c "import yaml; yaml.safe_load(open('.sops.yaml'))" 2>/dev/null; then
            echo "  ✅ .sops.yaml is valid YAML"
        else
            echo "  ❌ .sops.yaml parse error"; exit 1
        fi
    elif command -v ruby &>/dev/null; then
        if ruby -e 'require "yaml"; YAML.safe_load_file(ARGV.fetch(0), permitted_classes: [], aliases: false)' .sops.yaml 2>/dev/null; then
            echo "  ✅ .sops.yaml is valid YAML"
        else
            echo "  ❌ .sops.yaml parse error"; exit 1
        fi
    else
        echo "  ⚠️  No YAML parser available — skipping .sops.yaml syntax check"
    fi
    if [ -f secrets/README.md ]; then echo "  ✅ secrets/README.md present"; fi

# ── Git hygiene ──

# Check gitignore cleanliness — no tracked files that gitignore says to ignore
check-gitignore:
    #!/usr/bin/env bash
    echo "=== Git Hygiene ==="
    if ! git rev-parse --git-dir &>/dev/null; then echo "  ⚠️  Not a git repo — skipping"; exit 0; fi
    stale=$(git ls-files -ci --exclude-standard 2>/dev/null)
    if [ -n "$stale" ]; then
        echo "  ⚠️  Stale tracked files (should be in .gitignore):"
        echo "$stale" | sed 's/^/    /'
        echo "  🔧  Run 'just fix-gitignore' to remove from tracking"
    else
        echo "  ✅ No stale tracked files"
    fi
    bad=$(git diff --check HEAD 2>/dev/null || true)
    if [ -n "$bad" ]; then echo "  ⚠️  Whitespace issues:"; echo "$bad" | sed 's/^/    /'; fi
    if [ -f .gitallowed ]; then echo "  ✅ .gitallowed present"; fi
    committed_secrets=$(git ls-files 'secrets/*' 2>/dev/null | grep -v '\.enc$' | grep -v '\.sha256$' | grep -v '\.gitkeep' | grep -v 'README.md' || true)
    if [ -n "$committed_secrets" ]; then
        echo "  ❌ Unencrypted secrets tracked in git:"
        echo "$committed_secrets" | sed 's/^/    /'
        exit 1
    fi
    echo "  ✅ No unencrypted secrets in git"

# ── Template syntax ──

# Check template markers used by the model and Starship renderers
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
    if [ -x scripts/render-llama-models.sh ]; then
        rendered_tmp=$(mktemp -d)
        trap 'rm -rf "$rendered_tmp"' EXIT
        for platform in linux macos windows; do
            scripts/render-llama-models.sh "$platform" /tmp/models "$rendered_tmp/$platform.ini" >/dev/null
            if grep -q '[{}]' "$rendered_tmp/$platform.ini"; then
                echo "  ❌ $platform model router still has template markers"
                exit 1
            fi
        done
        rm -rf "$rendered_tmp"
        trap - EXIT
        echo "  ✅ Model renderer selects clean platform branches"
    fi
    echo "  ✅ All templates balanced"

# ── Nushell ──

# Validate Nushell config syntax
check-nu:
    #!/usr/bin/env bash
    echo "=== Nushell Config ==="
    if ! command -v nu &>/dev/null; then
        echo "  ⚠️  nu not installed — skipping"
        exit 0
    fi
    errors=0
    for f in config/nushell/env.nu config/nushell/config.nu config/nushell/login.nu; do
        if [ ! -f "$f" ]; then
            echo "  ⚠️  $f missing — skipping"
            continue
        fi
        diagnostics=$(nu --no-config-file --no-history --ide-check 100 "$f" 2>&1 || true)
        if echo "$diagnostics" | grep -q '"severity":"Error"'; then
            echo "  ❌ $f has syntax errors"
            echo "$diagnostics" | sed 's/^/    /' | head -8
            errors=$((errors + 1))
        else
            echo "  ✅ $f parses"
        fi
    done
    if [ "$errors" -gt 0 ]; then echo "  ❌ $errors Nushell config files have issues"; exit 1; fi
    echo "  ✅ All Nushell config files parse"

# ── Nix ──

# Validate the Nix flake and build profiles native to this machine.
# Windows uses bootstrap scripts; cross-platform profiles are evaluated but not
# built here because local builders cannot build foreign system derivations.
check-nix:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "=== Nix/Home Manager ==="
    if ! command -v nix &>/dev/null; then
        echo "  ⚠️  nix not installed — skipping"
        exit 0
    fi
    nix flake check --all-systems

    system=$(nix eval --impure --raw --expr 'builtins.currentSystem')
    profiles=()
    case "$system" in
        x86_64-linux)
            profiles=("juan@framearch" "juan@arch-wsl")
            ;;
        aarch64-darwin)
            profiles=("juan@macbook")
            ;;
        *)
            echo "  ⚠️  no native Home Manager profile for $system — evaluation only"
            ;;
    esac

    for profile in "${profiles[@]}"; do
        echo "  Building $profile..."
        nix build ".#homeConfigurations.\"$profile\".activationPackage" --no-link --quiet
    done
    echo "  ✅ Nix flake checks and native Home Manager builds pass"

# ──────────── Nushell health ────────────

# Full Nushell setup health check: config, integrations, keybindings, aliases.
# Run after tool upgrades or on a new machine.
nu-health:
    #!/usr/bin/env bash
    if [ -x scripts/nu-health.sh ]; then
        scripts/nu-health.sh
    else
        echo "  ⚠️  scripts/nu-health.sh not found"
        exit 1
    fi

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
    staged_secrets=$(git diff --cached --name-only -- 'secrets/*' 2>/dev/null | grep -v '\.enc$' | grep -v '\.sha256$' | grep -v '\.gitkeep' | grep -v 'README.md' || true)
    if [ -n "$staged_secrets" ]; then
        echo "  ❌ Staged unencrypted secrets:"
        echo "$staged_secrets" | sed 's/^/    /'
        errors=$((errors + 1))
    fi
    # 3. Check for merge conflict markers in staged files
    conflicts=$(git diff --cached --name-only -G'^<<<<<<< |^=======$|^>>>>>>>' 2>/dev/null || true)
    if [ -n "$conflicts" ]; then
        echo "  ❌ Merge conflict markers found in:"
        echo "$conflicts" | sed 's/^/    /'
        errors=$((errors + 1))
    fi
    # 4. Syntax-check any staged .nu files (Nushell config)
    if command -v nu >/dev/null 2>&1; then
        while IFS= read -r f; do
            diagnostics=$(nu --no-config-file --no-history --ide-check 100 "$f" 2>&1 || true)
            if echo "$diagnostics" | grep -q '"severity":"Error"'; then
                echo "  ❌ $f has Nushell syntax errors"
                echo "$diagnostics" | sed 's/^/    /' | head -8
                errors=$((errors + 1))
            else
                echo "  ✅ $f parses"
            fi
        done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.nu$' || true)
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

# ──────────── Home server deploy recipes ────────────

# Register the current (or named) git project on a home server for git-push deployments.
# Usage: just register-project acerpepe [project-name]
register-project server project="":
    #!/usr/bin/env bash
    PROJECT="{{project}}"
    if [ -z "$PROJECT" ]; then PROJECT="$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")"; fi
    ssh "{{server}}" "$HOME/deploy-hooks/register-project" "$PROJECT"

# Push the current project branch to a home server, triggering deploy.
# Usage: just deploy-server acerpepe [branch]
deploy-server server branch="main":
    #!/usr/bin/env bash
    git push "{{server}}" "{{branch}}"

# ──────────── Cheap cloud (throwaway dev containers) ────────────

# Spin up or manage a throwaway dev container on a home server.
# Usage:  just sandbox acerpepe up postgres:16-alpine [name]
#         just sandbox acerpepe list
#         just sandbox acerpepe logs <name>
#         just sandbox acerpepe down <name>
sandbox server action *args="":
    bash {{dotfiles-dir}}/bin/sandbox.sh {{server}} {{action}} {{args}}

# ──────────── Quality Gauntlet ────────────

# Run the full Uncle Bob quality gauntlet (all 7 gates).
# Usage:  just quality          # Full gauntlet
#         just quality --quick  # Skip mutation testing
#         just quality --gate lint # Single gate
quality *args="":
    #!/usr/bin/env bash
    exec {{dotfiles-dir}}/bin/quality-gauntlet {{args}}

# ──────────── Utility ────────────

# List all available recipes
list:
    @just --list --justfile {{justfile()}}

# Deploy native Windows configuration (Scoop handles packages).
windows-deploy:
    powershell.exe -ExecutionPolicy Bypass -File scripts\\deploy-windows.ps1

# Validate the Nix flake and build one Home Manager profile without activation.
# Usage: just nix-check juan@framearch
nix-check profile="juan@framearch":
    #!/usr/bin/env bash
    set -euo pipefail
    # New flake modules are invisible to evaluation until Git tracks them.
    # Use a temporary index so intent-to-add never mutates the user's index.
    index_path="${GIT_INDEX_FILE:-$(git rev-parse --git-path index)}"
    temp_index=$(mktemp)
    cp "$index_path" "$temp_index"
    export GIT_INDEX_FILE="$temp_index"
    trap 'rm -f "$temp_index"' EXIT
    git ls-files --others --exclude-standard -z -- home nixos | xargs -0 -r git add -N
    nix flake check --all-systems
    nix build '.#homeConfigurations."{{profile}}".activationPackage' --no-link --quiet
    echo "✅ Nix profile {{profile}} builds"

# Validate and activate one Home Manager profile.
# Usage: just nix-switch juan@framearch
nix-switch profile="juan@framearch":
    #!/usr/bin/env bash
    set -euo pipefail
    # Use a temporary index for untracked Nix modules; preserve the real index.
    index_path="${GIT_INDEX_FILE:-$(git rev-parse --git-path index)}"
    temp_index=$(mktemp)
    cp "$index_path" "$temp_index"
    export GIT_INDEX_FILE="$temp_index"
    trap 'rm -f "$temp_index"' EXIT
    git ls-files --others --exclude-standard -z -- home nixos | xargs -0 -r git add -N
    nix flake check --all-systems
    # Back up pre-existing paths during the Home Manager handoff.
    nix run ".#home-manager" -- -b hm-backup switch --flake '.#{{profile}}'

# Build the NixOS system closure without activating it.
# Run on an x86_64-linux builder; the disposable host profile is not cross-built.
nixos-check:
    #!/usr/bin/env bash
    set -euo pipefail
    nix flake check --all-systems
    system=$(nix eval --impure --raw --expr 'builtins.currentSystem')
    if [ "$system" != "x86_64-linux" ]; then
        echo "⚠️  NixOS framearch build requires x86_64-linux; current host is $system"
        echo "   Evaluation passed; run this recipe on the target or a matching builder."
        exit 0
    fi
    nix build '.#nixosConfigurations.framearch.config.system.build.toplevel' --no-link --quiet
    echo "✅ NixOS framearch system builds"

# Build the pinned CachyLLama binary and probe host Vulkan through nixGL.
# This is diagnostic only; it never touches the live llama.cpp service.
nix-test-cachy-vulkan profile="qwen-0.8b" port="18123" model="":
    scripts/nix-cachy-smoke.sh "{{profile}}" "{{port}}" "{{model}}"

# Validate the future NixOS memoryfield embedding service in isolation.
nix-test-cachy-embed port="18140":
    scripts/nix-cachy-embed-smoke.sh "{{port}}"

# Patch Pi npm packages (tidy-tools pi-fff adapter for symlinked npm root)
patch-pi-npm:
    bash {{dotfiles-dir}}/bin/patch-tidy-pi-fff

# Info about the environment
info:
    #!/usr/bin/env bash
    echo "=== Environment ==="
    echo "  Repo:      {{dotfiles-dir}}"
    echo "  just:      $(just --version 2>/dev/null || echo 'not found')"
    echo "  sops:      $(sops --version 2>/dev/null | head -1 || echo 'not found')"
    echo "  age:       $(age --version 2>/dev/null || echo 'not found')"
    echo "  shellcheck: $(command -v shellcheck 2>/dev/null && shellcheck --version 2>/dev/null | head -1 || echo 'not found')"
    echo "  deno:      $(deno --version 2>/dev/null | head -1 || echo 'not found')"
    echo "  node:      $(node --version 2>/dev/null || echo 'not found')"
    echo "  taplo:     $(taplo --version 2>/dev/null || echo 'not found')"

# ──────────── Project CI ────────────

# Run a project's own local CI gate.
# Usage:  just project-ci ~/projects/my-project
#         just project-ci   (uses current dir)
project-ci path="":
    #!/usr/bin/env bash
    PROJECT="{{path}}"
    if [ -z "$PROJECT" ]; then PROJECT="$(pwd)"; fi
    if [ ! -d "$PROJECT" ]; then
        echo "  ❌ Directory not found: $PROJECT"
        exit 1
    fi
    if [ ! -f "$PROJECT/justfile" ]; then
        echo "  ❌ No justfile found in $PROJECT"
        exit 1
    fi
    echo "  Running CI on: $(basename "$PROJECT")"
    echo ""
    cd "$PROJECT"
    exec just ci

# Copy the standard CI workflow (GitHub Actions) into a project.
# Usage:  just project-init-ci ~/projects/my-project
# Creates .github/workflows/ci.yml that delegates to 'just ci', prompting
# before replacing an existing file.
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

# Start Pi without optional package resources for quick low-latency tasks.
pi-fast *args="":
    #!/usr/bin/env bash
    exec "$PWD/bin/pi-fast" {{args}}

# ──────────── Pi Session Optimisation ────────────

# Show session usage stats (last N sessions from observability history).
pi-stats n="10":
    #!/usr/bin/env bash
    HISTORY="$HOME/.pi/agent/observability/history.jsonl"
    if [ ! -f "$HISTORY" ]; then
        echo "No observability history found."
        exit 0
    fi
    cat "$HISTORY" | tail -"{{n}}" | python3 -c '
    import json, sys, statistics
    recs = [json.loads(l) for l in sys.stdin if l.strip()]
    active = [r for r in recs if r.get("turns",0) > 1]
    print(f"Sessions: {len(recs)} total, {len(active)} active (\u22652 turns)")
    if active:
        costs = [r["cost"] for r in active if r.get("cost",0) > 0]
        mins = [r.get("runtimeMs",0)/60000 for r in active]
        ts = [r.get("turns",0) for r in active]
        print(f"Avg turns:  {statistics.mean(ts):.0f}")
        print(f"Avg dur:    {statistics.mean(mins):.0f}m")
        print(f"Avg cost:   ${statistics.mean(costs):.4f}")' 2>/dev/null || echo "Error parsing history"

# Summary of all session file storage. This is read-only: sessions are retained.
pi-session-size:
    #!/usr/bin/env bash
    set -euo pipefail
    primary="${PI_CODING_AGENT_DIR:-$HOME/dotfiles/pi/agent}/sessions"
    fallback="$HOME/.pi/agent/sessions"
    seen=""
    for dir in "$primary" "$fallback"; do
        [ -d "$dir" ] || continue
        real=$(cd "$dir" && pwd -P)
        case ":$seen:" in *":$real:"*) continue ;; esac
        seen="${seen:+$seen:}$real"
        echo "Session storage: $(du -sh "$dir" | cut -f1)  $dir"
        echo "  Sessions by project:"
        for d in "$dir"/--*; do
            [ -d "$d" ] || continue
            name=$(basename "$d" | sed 's/^--//;s/--$//' | tr - " ")
            count=$(find "$d" -name "*.jsonl" 2>/dev/null | wc -l | tr -d " ")
            size=$(du -sh "$d" 2>/dev/null | cut -f1)
            echo "    $count  $size  $name"
        done | sort -rn
        echo ""
    done

# Prune old sessions. Use project=all to target every session directory.
# Usage:  just pi-prune-sessions 30 dotfiles
#         just pi-prune-sessions 30 all
pi-prune-sessions days="30" project="dotfiles":
    #!/usr/bin/env bash
    ROOT="${PI_CODING_AGENT_DIR:-$HOME/dotfiles/pi/agent}/sessions"
    if [ ! -d "$ROOT" ]; then
        echo "Session dir not found: $ROOT"
        exit 1
    fi
    targets=()
    if [ "{{project}}" = "all" ]; then
        while IFS= read -r -d '' dir; do targets+=("$dir"); done < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '--*--' -print0)
    else
        while IFS= read -r -d '' dir; do targets+=("$dir"); done < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '*{{project}}*' -print0)
    fi
    if [ "${#targets[@]}" -eq 0 ]; then
        echo "No session directories matched project '{{project}}'"
        exit 0
    fi
    before=0; after=0
    for dir in "${targets[@]}"; do
        before=$((before + $(find "$dir" -name '*.jsonl' -type f | wc -l)))
        find "$dir" -name '*.jsonl' -type f -mtime +"{{days}}" -delete 2>/dev/null
        after=$((after + $(find "$dir" -name '*.jsonl' -type f | wc -l)))
    done
    echo "Deleted $((before - after)) sessions older than {{days}}d from {{project}}"
    echo "Remaining: $after"

# Run the full pi health check (terminal summary). Pass `--json` for machine-readable output.
pi-healthcheck *args="":
    #!/usr/bin/env bash
    cd "{{dotfiles-dir}}" && exec ./bin/pi-healthcheck {{args}}
