#!/usr/bin/env bash
# Compatibility wrapper: Pi package resources are declared in pi/agent/settings.json.
# Keep this entry point for existing muscle memory, but do not maintain a second
# unpinned package list here.
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec "$repo_root/pi/agent/npm/install-and-patch.sh" "$@"
