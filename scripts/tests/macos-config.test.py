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

# One manager per command. A tool declared in both places is not a fallback: in
# an interactive zsh `/opt/homebrew/bin` precedes `~/.nix-profile/bin`, so the
# older brew copy wins. This replaces per-tool assertions ("Brewfile duplicates
# Home Manager-owned ShellCheck") that only guarded the tools someone remembered.
#
# Scope is declarations, not installed formulae: a brew formula pulled in as a
# build dependency of a keepsake (node for llama.cpp) is Homebrew's business.
# The comparison is name-based, so a package whose attr and formula differ
# beyond NIX_NAME_ALIASES escapes it - poppler (attr `poppler-utils`) did, and
# was a live duplicate for a while."
BOOTSTRAP_EXCEPTIONS = {"age", "git", "sops"}
# Brew formula names that differ from the command they install. Static analysis
# can only see names, so a pair missing here passes unnoticed -- `just doctor`
# resolves the real command from the Cellar and catches the rest on this host.
BREW_NAME_ALIASES = {
    "kubernetes-cli": "kubectl",
    "huggingface-cli": "hf",
    "gnu-typist": "gtypist",
    "gnu-sed": "gsed",
    "php@8.3": "php",
}
# Nix attribute names that differ from the command they install.
NIX_NAME_ALIASES = {
    "nodejs_24": "node",
    "gnused": "gnu-sed",
    "gnumake": "make",
    "bashInteractive": "bash",
    "transmission_4": "transmission-cli",
}

def nix_package_names(relative: str) -> set[str]:
    source = read(relative)
    names: set[str] = set()
    for block in re.findall(r"home\.packages\s*=\s*with\s+pkgs;\s*\[(.*?)\n\s*\]", source, re.S):
        for line in block.splitlines():
            line = line.split("#", 1)[0].strip()
            if re.fullmatch(r"[A-Za-z0-9_.\-]+", line):
                names.add(line)
    return names

nix_owned = set()
for module in ("home/common.nix", "home/darwin-packages.nix"):
    nix_owned |= {NIX_NAME_ALIASES.get(n, n) for n in nix_package_names(module)}
brew_commands = {BREW_NAME_ALIASES.get(f, f) for f in formulae}
conflicts = sorted((brew_commands & nix_owned) - BOOTSTRAP_EXCEPTIONS)
require(
    not conflicts,
    "Brewfile declares commands Home Manager already owns "
    f"(remove the brew line, or add the binary to NIX_NAME_ALIASES if the name differs): {conflicts}",
)

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
    # OmniWM's GUI omits empty override arrays when saving.
    require(isinstance(omniwm.get(key, []), list), f"OmniWM override {key} must be an array")
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
bindings = [
    entry["binding"] for entry in omniwm["hotkeys"]
    if entry.get("binding") not in (None, "Unassigned")
]
require(len(bindings) == len(set(bindings)), "OmniWM contains duplicate bindings")
require(omniwm["workspaceBar"]["position"] == "bottom", "OmniWM bar must sit at the bottom")
require(omniwm["workspaceBar"]["reserveLayoutSpace"] is True, "OmniWM bar must reserve space")
require(omniwm["workspaceBar"]["fullWidth"] is False, "OmniWM bar must not span the full display")
require(omniwm["workspaceBar"]["hideEmptyWorkspaces"] is False, "OmniWM bar must show all workspaces")
shell_style = tomllib.loads(read("config-macos/omniwm/shell/default/shell.toml"))
require(shell_style["leading"] == ["workspaces"], "OmniShell bar must show only workspaces")
require(shell_style["center"] == [] and shell_style["trailing"] == [], "OmniShell must have no other bar widgets")
require(shell_style["workspaceBar"]["position"] == "bottom", "OmniShell bar must sit at the bottom")
require(shell_style["workspaceBar"]["fullWidth"] is False, "OmniShell bar must not span the full display")
require(shell_style["workspaceBar"]["hideEmptyWorkspaces"] is False, "OmniShell must show all workspaces")
require(shell_style["hiddenBarWidget"] == "hidden-bar", "OmniShell must retain Hidden Bar integration")
require("io.tailscale.ipn.macsys" not in omniwm["hiddenBar"]["hiddenBundleIDs"], "Tailscale must remain visible in the native menu bar")

print("macOS static checks passed")
