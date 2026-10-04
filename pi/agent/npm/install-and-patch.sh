#!/bin/bash
# Install dependencies and apply patches
set -e

cd "$(dirname "$0")"

# Run npm install
npm install "$@"

# Apply patches
echo "Applying patches..."
npx patch-package

# The published tidy-tools manifest incorrectly installs a private TypeBox copy.
# Its patch makes TypeBox host-provided; remove the stale copy left by npm install.
rm -rf node_modules/@mobrienv/pi-tidy-tools/node_modules/typebox
