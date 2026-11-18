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
require(omniwm["schemaVersion"] == 5, "OmniWM config must use schema version 5")
require(len(ids) == len(set(ids)), "OmniWM contains duplicate action IDs")
require(
    {
        "resizeContainerPrimarySpan.shrink", "resizeContainerPrimarySpan.grow",
        "resizeWindowPrimarySpan.shrink", "resizeWindowPrimarySpan.grow",
        "resizeWindowSecondarySpan.shrink", "resizeWindowSecondarySpan.grow",
    }.issubset(ids),
    "OmniWM v0.8 resize action IDs are missing",
)
require(
    not any(action.startswith(("setContainerPrimarySpan.", "setWindowPrimarySpan.", "setWindowSecondarySpan.")) for action in ids),
    "OmniWM config still contains v0.7 resize action IDs",
)
bindings = [entry["binding"] for entry in omniwm["hotkeys"] if "binding" in entry]
require(len(bindings) == len(set(bindings)), "OmniWM contains duplicate bindings")
require(omniwm["workspaceBar"]["position"] == "bottom", "OmniWM bar must sit at the bottom")
require(omniwm["workspaceBar"]["reserveLayoutSpace"] is True, "OmniWM bar must reserve space")
require(omniwm["workspaceBar"]["fullWidth"] is False, "OmniWM bar must not span the full display")
require(omniwm["workspaceBar"]["hideEmptyWorkspaces"] is False, "OmniWM bar must show all workspaces")
shell_style = tomllib.loads(read("config-macos/omniwm/shell-default.toml"))
require(shell_style["leading"] == ["workspaces"], "OmniShell bar must show only workspaces")
require(shell_style["center"] == [] and shell_style["trailing"] == [], "OmniShell must have no other bar widgets")
require(shell_style["workspaceBar"]["position"] == "bottom", "OmniShell bar must sit at the bottom")
require(shell_style["workspaceBar"]["fullWidth"] is False, "OmniShell bar must not span the full display")
require(shell_style["workspaceBar"]["hideEmptyWorkspaces"] is False, "OmniShell must show all workspaces")
require(shell_style["hiddenBarWidget"] == "hidden-bar", "OmniShell must retain Hidden Bar integration")
require("io.tailscale.ipn.macsys" not in omniwm["hiddenBar"]["hiddenBundleIDs"], "Tailscale must remain visible in the native menu bar")

print("macOS static checks passed")
