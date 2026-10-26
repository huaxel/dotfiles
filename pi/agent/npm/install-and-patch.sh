#!/usr/bin/env bash
# Script-disabled dependency installation followed by reviewed, explicit patches.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
mode=${1:-install}
if (( $# > 1 )); then
    printf 'usage: %s [install|ci|patch|check]\n' "$0" >&2
    exit 2
fi
case "$mode" in
    install|ci)
        # Explicit flags win over .npmrc/environment; never approve or execute hooks.
        # ci intentionally replaces node_modules: use it only for a chosen clean install.
        NPM_CONFIG_IGNORE_SCRIPTS=true npm --prefix "$ROOT" --global=false "$mode" \
            --ignore-scripts --legacy-peer-deps
        ;;
    patch|check) ;;
    *)
        printf 'usage: %s [install|ci|patch|check]\n' "$0" >&2
        exit 2
        ;;
esac
if [[ "$mode" == check ]]; then
    exec python3 "$ROOT/apply-patches.py" --root "$ROOT" --check
fi
exec python3 "$ROOT/apply-patches.py" --root "$ROOT"
