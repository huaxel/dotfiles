#!/usr/bin/env python3
"""Static cross-platform checks for Windows and WSL configuration."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8-sig")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


# All JSON shipped to native Windows must remain syntactically valid.
for relative in (
    "windows-terminal/settings.json",
    "zebar/settings.json",
    "zebar/bar/zpack.json",
):
    json.loads(read(relative))

terminal = read("windows-terminal/settings.json")
require("C:\\\\Users\\\\" not in terminal, "Windows Terminal contains a hard-coded user path")
require("%USERPROFILE%\\\\scoop\\\\apps\\\\pwsh" in terminal, "pwsh profile is not user-portable")

deploy = read("scripts/deploy-windows.ps1")
require("Microsoft\\Windows Terminal\\settings.json" in deploy, "Unpackaged Windows Terminal settings path is missing")
require("Microsoft.WindowsTerminal_8wekyb3d8bbwe" in deploy, "Store Windows Terminal settings path is missing")
require("Get-AppxPackage -Name Microsoft.WindowsTerminal" in deploy, "Windows Terminal install type is not detected")
require("mklink /J" in deploy, "Directory deployment has no non-admin junction fallback")
require('Write-Host "  [COPY]' in deploy, "File deployment has no non-admin copy fallback")
require("function Render-WindowsGitConfig" in deploy, "Windows Git config is not rendered")
require("Render-WindowsGitConfig" in deploy and 'Source = "gitconfig"' not in deploy, "Windows deploy may install the raw Git template")
require("{{#if (eq os" in read("gitconfig"), "Git config platform template markers are missing from regression coverage")
require('Source = "zebar\\bar"' in deploy, "Zebar startup pack is not deployed")
link_removal = deploy.split("if ($existing.LinkType)", 1)[1].split("return", 1)[0]
require("-Recurse" not in link_removal, "Windows deployment can recurse through a configuration link")

bootstrap = read("bootstrap.ps1")
require("Age key not found" in bootstrap, "Bootstrap does not preflight the local Age key")
require(bootstrap.index("Age key not found") < bootstrap.index("Installing Scoop..."), "Age key preflight runs after package installation")
for secret in ("environment.d.enc", "llama-webui-config.json.enc", "pi-quota-sessions.json.enc"):
    require(secret in bootstrap, f"Bootstrap does not preflight {secret}")
require('"nerd-fonts"' in bootstrap, "Nerd Fonts bucket is missing")
require('"JetBrainsMono-NF", "FiraCode-NF"' in bootstrap, "Configured terminal fonts are not installed")
require("Assert-NativeSuccess" in bootstrap, "Native Scoop/Git failures are not checked")
require("scoop bucket add $name $customBuckets[$alias]" in bootstrap, "Custom Scoop bucket uses a non-portable alias")

secrets = read("scripts/deploy-secrets.ps1")
require('throw "Failed to decrypt $Source"' in secrets, "Secret decryption failure is non-fatal")
require("throw \"Age key not found" in secrets, "Missing Age key is non-fatal")
require("Required encrypted secret is missing" in secrets, "Missing encrypted inputs are non-fatal")

loader = read("powershell/Load-Secrets.ps1")
require("Skipping Openference auth sync" in loader, "Malformed auth JSON is not preserved")
require("WriteAllText($temporary" in loader and "Move-Item -LiteralPath $temporary" in loader, "Auth writes are not atomic")

compact_ps = read("scripts/compact-wsl.ps1")
require("[switch]$ConfirmDestructive" in compact_ps, "Destructive WSL re-import lacks explicit confirmation")
require("if ($ExportFallback -and -not $ConfirmDestructive)" in compact_ps, "Destructive confirmation is not enforced")
require(compact_ps.count("Invoke-ExportReimport -Name $Distro") == 1, "WSL re-import can run outside the explicit fallback branch")
require("No destructive fallback was run" in compact_ps, "Sparse failure can silently trigger destructive fallback")

compact_sh = read("scripts/compact-wsl.sh")
require('${PURGE_ATOM_DATA:-false}' in compact_sh and '${1:-}' in compact_sh, "Optional purge inputs are unsafe under set -u")
require('${ALLOW_UNSAFE_SPARSE:-false}' in compact_sh, "Unsafe sparse mode is not explicitly gated")
require('"${ORPHANS[@]}"' in compact_sh, "Pacman orphan package arguments are not expanded safely")

vpn = read("scripts/wsl-vpn-setup.sh")
status_block = vpn.split("status)", 1)[1].split(";;", 1)[0]
require("check_mount" in status_block and "mount_atomsrc" not in status_block, "WSL status command mutates mount state")

print("windows/wsl static checks passed")
