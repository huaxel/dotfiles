#!/usr/bin/env python3
"""Static checks for macOS bootstrap, defaults, and maintenance scripts."""

from __future__ import annotations

import re
import tomllib
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


brewfile = read("config/Brewfile")
formulae = re.findall(r'^brew "([^"]+)"', brewfile, re.MULTILINE)
casks = re.findall(r'^cask "([^"]+)"', brewfile, re.MULTILINE)
require(len(formulae) == len(set(formulae)), "Brewfile contains duplicate formulae")
require(len(casks) == len(set(casks)), "Brewfile contains duplicate casks")
require('cask "tailscale-app"' in brewfile, "Tailscale app is missing")
require('brew "tailscale"' not in brewfile, "Tailscale formula conflicts with the macOS app")
require("restart_service:" not in brewfile, "Brewfile unexpectedly auto-starts background services")
for mise_owned in ("go", "node@22", "python@3.12", "ruby", "rust"):
    require(f'brew "{mise_owned}"' not in brewfile, f"Brewfile duplicates mise-owned runtime: {mise_owned}")
require('brew "shellcheck"' not in brewfile, "Brewfile duplicates Home Manager-owned ShellCheck")

defaults = read("macos/defaults.sh")
require("LSQuarantine -bool false" not in defaults, "macOS download quarantine is disabled")
require("defaults delete com.apple.LaunchServices LSQuarantine" in defaults, "legacy quarantine opt-out is not removed")
require("askForPasswordDelay -int 0" in defaults, "screen lock is not immediate")

cleanup = read("macos/cleanup.sh")
require("set -euo pipefail" in cleanup, "cleanup failures can be ignored")
require("eval " not in cleanup, "cleanup executes commands through eval")
require('case "$value" in' in cleanup, "cleanup mode inputs are not validated")
require('run mv -n -- "$mov"' in cleanup, "cleanup can overwrite an existing screen recording")

bootstrap = read("bootstrap.sh")
require("grep -v '^mas \"'" in bootstrap, "bootstrap does not separate App Store entries from Brew packages")
require("mas account" not in bootstrap, "bootstrap uses the removed mas account subcommand")
require("mas install \"$app_id\"" in bootstrap, "bootstrap does not attempt missing App Store apps")
require("grep -qx \"$app_id\"" in bootstrap, "App Store app IDs are matched as substrings")
require('critical "Some Homebrew packages failed' in bootstrap, "failed package provisioning is not reported as incomplete")

omniwm = tomllib.loads(read("config-macos/omniwm/settings.toml"))
for key in (
    "monitorBarOverrides", "monitorOrientationOverrides", "monitorNiriOverrides",
    "monitorDwindleOverrides", "monitorGapOverrides",
):
    require(isinstance(omniwm.get(key), list), f"OmniWM requires root-level {key}")
for section in ("workspaces", "appRules"):
    for entry in omniwm[section]:
        if "id" in entry:
            UUID(entry["id"])  # Invalid UUIDs reject the entire config.
ids = [entry["id"] for entry in omniwm["hotkeys"]]
require(len(ids) == len(set(ids)), "OmniWM contains duplicate action IDs")
bindings = [entry["binding"] for entry in omniwm["hotkeys"] if "binding" in entry]
require(len(bindings) == len(set(bindings)), "OmniWM contains duplicate bindings")
require(omniwm["workspaceBar"]["position"] == "bottom", "OmniWM bar must be at bottom")
require(omniwm["workspaceBar"]["reserveLayoutSpace"] is True, "OmniWM bar must reserve space")

print("macOS static checks passed")
