# Pre-deploy hook: sync skills and extensions (Windows)
# This runs before dotter deploys, via .dotter/pre_deploy.sh dispatcher.
#
# Equivalent of the bash version in .dotter/pre_deploy.bash

$DOTFILES_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)

function Sync-Dir {
    param(
        [string]$SourceDir,
        [string]$TargetDir,
        [string]$Label
    )

    if (-not (Test-Path $SourceDir)) {
        Write-Host "  (skipped $Label -- source not found)"
        return
    }

    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

    # Check if dotter already symlinked this directory; if the target
    # resolves back to the source, skip the copy to avoid copying a
    # symlink onto itself.
    $sample = Get-ChildItem -File $SourceDir | Select-Object -First 1
    if ($sample) {
        $rel = $sample.FullName.Substring($SourceDir.Length).TrimStart('\').TrimStart('/')
        $targetSample = Join-Path $TargetDir $rel
        if (Test-Path $targetSample) {
            $sourceResolved = (Resolve-Path $sample.FullName -ErrorAction SilentlyContinue).Path
            $targetResolved = (Resolve-Path $targetSample -ErrorAction SilentlyContinue).Path
            if ($sourceResolved -and $targetResolved -and
                $sourceResolved -eq $targetResolved) {
                Write-Host "[OK] $Label already linked by Dotter; skipping pre-deploy copy"
                return
            }
        }
    }

    # Copy directory contents
    Get-ChildItem -Path $SourceDir | Copy-Item -Destination $TargetDir -Recurse -Force
    Write-Host "[OK] $Label synced to $TargetDir"
}

Sync-Dir -SourceDir (Join-Path $DOTFILES_DIR "skills") -TargetDir "$HOME\.agents\skills" -Label "skills"
Sync-Dir -SourceDir (Join-Path $DOTFILES_DIR "pi/agent/extensions") -TargetDir "$HOME\.pi\agent\extensions" -Label "pi extensions"
