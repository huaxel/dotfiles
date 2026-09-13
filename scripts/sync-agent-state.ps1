#Requires -Version 5.1

# Sync repository-managed skills and Pi extensions into native Windows locations.

$DOTFILES_DIR = Split-Path -Parent $PSScriptRoot

function Sync-Dir {
    param(
        [string]$SourceDir,
        [string]$TargetDir,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $SourceDir)) {
        Write-Host "  (skipped $Label -- source not found)"
        return
    }

    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

    # Resolve the roots before copying. This also handles source directories
    # that contain only nested skill folders and avoids copying a symlink onto
    # itself when the target already points into the repository.
    $sourceResolved = (Resolve-Path -LiteralPath $SourceDir -ErrorAction SilentlyContinue).Path
    $targetResolved = (Resolve-Path -LiteralPath $TargetDir -ErrorAction SilentlyContinue).Path
    if ($sourceResolved -and $targetResolved -and
        $sourceResolved.Equals($targetResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Host "[OK] $Label already linked; skipping copy"
        return
    }

    Get-ChildItem -LiteralPath $SourceDir | Copy-Item -Destination $TargetDir -Recurse -Force
    Write-Host "[OK] $Label synced to $TargetDir"
}

$PI_AGENT_DIR = if ($env:PI_CODING_AGENT_DIR) {
    $env:PI_CODING_AGENT_DIR
} else {
    Join-Path $DOTFILES_DIR "pi\agent"
}

Sync-Dir -SourceDir (Join-Path $DOTFILES_DIR "skills") -TargetDir (Join-Path $HOME ".agents\skills") -Label "skills"
Sync-Dir -SourceDir (Join-Path $DOTFILES_DIR "pi/agent/extensions") -TargetDir (Join-Path $PI_AGENT_DIR "extensions") -Label "pi extensions"
