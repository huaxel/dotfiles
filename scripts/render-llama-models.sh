#!/usr/bin/env bash
# Render the platform branch of the llama.cpp model router.
# Usage: render-llama-models.sh <linux|macos|windows> <models-base-path> <output> [template]

set -euo pipefail

platform=${1:?platform is required (linux or macos)}
models_base_path=${2:?models base path is required}
output=${3:?output path is required}

case "$platform" in
  linux|macos|windows) ;;
  *) echo "unsupported platform: $platform" >&2; exit 2 ;;
esac

source_file=${4:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/llama-models.ini"}
temporary="${output}.tmp.$$"
trap 'rm -f "$temporary"' EXIT
mkdir -p "$(dirname "$output")"

"${AWK:-awk}" -v platform="$platform" -v models_base_path="$models_base_path" '
  BEGIN { active = 1 }
  /^\{\{#if \(eq os "linux"\)\}\}$/ { active = (platform == "linux"); next }
  /^\{\{else if \(eq os "windows"\)\}\}$/ { active = (platform == "windows"); next }
  /^\{\{else\}\}$/ { active = (platform == "macos"); next }
  /^\{\{\/if\}\}$/ { active = 1; next }
  active {
    gsub(/\{\{ models_base_path \}\}/, models_base_path)
    print
  }
' "$source_file" > "$temporary"

mv "$temporary" "$output"
trap - EXIT
printf 'Rendered %s model router: %s\n' "$platform" "$output"
