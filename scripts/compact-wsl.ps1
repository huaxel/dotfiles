#Requires -Version 5.1

<#
.SYNOPSIS
    Compact WSL2 VHDX without admin rights.

.DESCRIPTION
    Runs cleanup + fstrim inside WSL, then enables sparse VHDX so the
    freed space is returned to the host filesystem.  No admin required.

    WSL 2.6+ only (uses `wsl --manage --set-sparse` with --allow-unsafe
    fallback).  Falls back to export/re-import if sparse is unavailable.

.PARAMETER Distro
    WSL distro name. Defaults to the first running distro or "archlinux".

.PARAMETER SkipLinuxCleanup
    Skip the internal cleanup (pacman, caches, fstrim). Only enable sparse VHDX.

.PARAMETER ExportFallback
    Use export/re-import instead of --set-sparse (more aggressive, requires temp space).

.EXAMPLE
    .\scripts\compact-wsl.ps1

.EXAMPLE
    .\scripts\compact-wsl.ps1 -Distro Ubuntu -ExportFallback
#>

param(
    [string]$Distro = "",
    [switch]$SkipLinuxCleanup,
    [switch]$ExportFallback
)

$ErrorActionPreference = "Stop"

function Write-Info  { Write-Host "→ $($args[0])" -ForegroundColor Blue }
function Write-Ok    { Write-Host "✓ $($args[0])" -ForegroundColor Green }
function Write-Warn  { Write-Host "⚠ $($args[0])" -ForegroundColor Yellow }
function Write-Err   { Write-Host "✗ $($args[0])" -ForegroundColor Red }
function Write-Header{ Write-Host "`n━━━ $($args[0]) ━━━" -ForegroundColor Cyan }

# ── Detect distro ──────────────────────────────────────────────────────

if (-not $Distro) {
    $running = wsl --list --running --quiet 2>$null
    if ($running) {
        $Distro = ($running | Select-Object -First 1).Trim()
    }
}
if (-not $Distro) {
    $all = wsl --list --quiet 2>$null
    if ($all) {
        $Distro = ($all | Select-Object -First 1).Trim()
    }
}
if (-not $Distro) {
    $Distro = "archlinux"
    Write-Warn "Could not detect distro, defaulting to '$Distro'"
}
Write-Info "Target distro: $Distro"

# ── Step 1: Show current VHDX size ─────────────────────────────────────

Write-Header "VHDX size on host"

$vhdxPaths = @(
    "$env:LOCALAPPDATA\Packages\*$Distro*\LocalState\ext4.vhdx",
    "$env:LOCALAPPDATA\Packages\*\LocalState\ext4.vhdx",
    "$env:USERPROFILE\AppData\Local\WSL\$Distro\ext4.vhdx"
)

$vhdxFile = $null
foreach ($pattern in $vhdxPaths) {
    $matches = Resolve-Path $pattern -ErrorAction SilentlyContinue
    if ($matches) {
        $vhdxFile = $matches[0]
        break
    }
}

if ($vhdxFile -and (Test-Path $vhdxFile)) {
    $size = (Get-Item $vhdxFile).Length
    Write-Info "VHDX file: $vhdxFile"
    if ($size -gt 1TB) { Write-Info "Size: $('{0:N2} TB' -f ($size / 1TB))" }
    elseif ($size -gt 1GB) { Write-Info "Size: $('{0:N2} GB' -f ($size / 1GB))" }
    else { Write-Info "Size: $('{0:N2} MB' -f ($size / 1MB))" }
} else {
    Write-Warn "Could not find VHDX file (expected under `$env:LOCALAPPDATA\Packages\...)"

    Write-Info "Searching for ext4.vhdx..."
    $found = Get-ChildItem -Path "$env:LOCALAPPDATA\Packages" -Filter "ext4.vhdx" -Recurse -ErrorAction SilentlyContinue |
             Select-Object -First 1
    if ($found) {
        $vhdxFile = $found.FullName
        Write-Info "Found: $vhdxFile"
        $size = $found.Length
        Write-Info "Size: $('{0:N2} GB' -f ($size / 1GB))"
    }
}

# ── Step 2: Run cleanup inside WSL ────────────────────────────────────

if (-not $SkipLinuxCleanup) {
    Write-Header "WSL internal cleanup"

    Write-Info "Running cleanup script inside WSL..."
    wsl --distribution $Distro -- bash -c @"
        set -euo pipefail
        echo '→ Pacman cache...'
        sudo pacman -Sc --noconfirm 2>/dev/null || true
        orphans=\$(pacman -Qtdq 2>/dev/null || true)
        if [ -n \"\$orphans\" ]; then
            echo "→ Removing orphaned packages..."
            sudo pacman -Rns --noconfirm \$orphans 2>/dev/null || true
        fi
        echo '→ npm cache...'
        npm cache clean --force 2>/dev/null || true
        echo '→ pip cache...'
        pip3 cache purge 2>/dev/null || true
        echo '→ Codex cache...'
        rm -rf ~/.codex/cache 2>/dev/null || true
        echo '→ Journal...'
        sudo journalctl --vacuum-time=7d 2>/dev/null || true
        echo '→ Trimming filesystem...'
        sudo fstrim -v / 2>/dev/null || echo '  (trim not supported)'
        echo '✓ Cleanup complete'
"@ 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

    Write-Ok "WSL internal cleanup complete"
}

# ── Step 3: Shutdown WSL ───────────────────────────────────────────────

Write-Header "WSL shutdown"

Write-Info "Shutting down all WSL instances..."
wsl --shutdown 2>&1 | Out-Null
Write-Ok "WSL shut down"

# ── Step 4: Compact VHDX ────────────────────────────────────────────────

if ($ExportFallback) {
    # ── Export / re-import method ──────────────────────────────────────
    Write-Header "Compact via export/re-import"

    $backup = "$env:TEMP\${Distro}-backup.tar"
    Write-Info "Exporting ${Distro} to ${backup}..."
    wsl --export $Distro $backup
    Write-Ok "Export complete ($('{0:N2} GB' -f ((Get-Item $backup).Length / 1GB)))"

    Write-Info "Unregistering old distro..."
    wsl --unregister $Distro

    Write-Info "Importing back with fresh VHDX..."
    $installPath = "$env:LOCALAPPDATA\WSL\$Distro"
    wsl --import $Distro $installPath $backup --version 2
    Write-Ok "Import complete — fresh compact VHDX created"

    Write-Info "Cleaning up backup..."
    Remove-Item $backup -Force
    Write-Ok "Backup deleted"
} else {
    # ── Sparse VHDX method ─────────────────────────────────────────────
    Write-Header "Set sparse VHDX"

    Write-Info "Enabling sparse VHDX for '${Distro}'..."
    $result = wsl --manage $Distro --set-sparse true 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Sparse VHDX enabled — space will be auto-reclaimed."
    } else {
        Write-Warn "wsl --manage --set-sparse failed: $result"
        Write-Warn "Trying with --allow-unsafe flag..."
        $result2 = wsl --manage $Distro --set-sparse true --allow-unsafe 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Sparse VHDX enabled (allow-unsafe)."
        } else {
            Write-Warn "--allow-unsafe also failed. Falling back to export/re-import..."
            $fallback = "$env:TEMP\${Distro}-backup.tar"
            Write-Info "Exporting ${Distro}..."
            wsl --export $Distro $fallback
            Write-Info "Unregistering..."
            wsl --unregister $Distro
            $installPath = "$env:LOCALAPPDATA\WSL\$Distro"
            Write-Info "Importing back..."
            wsl --import $Distro $installPath $fallback --version 2
            Remove-Item $fallback -Force
            Write-Ok "Re-import complete"
        }
    }
}

# ── Done ────────────────────────────────────────────────────────────────

Write-Header "Done"
Write-Ok "WSL compaction complete!"
Write-Host ""
Write-Host "  Next time you launch ${Distro}, the VHDX will be fresh/compact." -ForegroundColor Cyan
Write-Host ""
