#!/usr/bin/env bash
# Pre-deploy hook delegator
# Dotter copies hook scripts to .dotter/cache/.dotter/ before running them.
# Navigate up two levels to reach the real .dotter/ directory.
DOTTER_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
exec "$DOTTER_DIR/pre_deploy.bash"
