#!/bin/bash
# Install dependencies and apply patches
set -e

cd "$(dirname "$0")"

# Run npm install
npm install "$@"

# Apply patches
echo "Applying patches..."
npx patch-package
