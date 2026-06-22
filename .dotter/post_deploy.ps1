# Post-deploy hook: decrypt secrets with sops (Windows)
# Run manually after `dotter deploy`, or integrate into bootstrap.ps1:
#   . .\.dotter\post_deploy.ps1
#
# Requires: scoop install age sops
# NOTE: Keep this file ASCII-safe (no emoji) to avoid encoding issues
#       when invoked through the dotter hook dispatcher.

$DOTFILES_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$SECRETS_DIR = Join-Path $DOTFILES_DIR "secrets"
$DECRYPT_DIR = [System.IO.Path]::Combine($env:USERPROFILE, ".config", "secrets")

# Check if sops and age are available
if (-not (Get-Command sops -ErrorAction SilentlyContinue) -or `
    -not (Get-Command age -ErrorAction SilentlyContinue)) {
    Write-Host "[WARN] sops or age not found -- install with: scoop install age sops" -ForegroundColor Yellow
    return
}

# Check if age key exists
$ageKeyPath = "$env:USERPROFILE\.config\sops\age\keys.txt"
if (-not (Test-Path $ageKeyPath)) {
    Write-Host "[WARN] Age key not found at $ageKeyPath" -ForegroundColor Yellow
    Write-Host "   Generate one with: age-keygen -o $ageKeyPath" -ForegroundColor Yellow
    return
}

# sops on Windows does not auto-detect ~/.config/sops/age/keys.txt
# so we must set SOPS_AGE_KEY_FILE explicitly
$env:SOPS_AGE_KEY_FILE = $ageKeyPath

# Decrypt secrets
if (Test-Path $SECRETS_DIR) {
    New-Item -ItemType Directory -Force -Path $DECRYPT_DIR | Out-Null

    Get-ChildItem "$SECRETS_DIR\*.enc" -File | ForEach-Object {
        $encFile = $_.FullName
        $filename = $_.BaseName  # name without .enc

        # App-specific secrets decrypt to their real config path
        switch ($filename) {
            "llama-webui-config.json" {
                $dest = [System.IO.Path]::Combine($env:USERPROFILE, ".config", "llama.cpp", "webui-config.json")
                New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
                # Clear read-only if exists (from a previous deploy)
                if (Test-Path $dest) { attrib -R $dest }
                Write-Host "[...] Decrypting $filename..." -NoNewline
                & sops --decrypt --output-type binary --output $dest $encFile 2>$null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host " [OK] -> $dest" -ForegroundColor Green
                } else {
                    Write-Host " [FAIL]" -ForegroundColor Red
                }
                continue
            }
        }

        $decryptPath = [System.IO.Path]::Combine($DECRYPT_DIR, $filename)
        # Clear read-only if exists (from a previous deploy)
        if (Test-Path $decryptPath) { attrib -R $decryptPath }
        Write-Host "[...] Decrypting $filename..." -NoNewline
        & sops --decrypt --output-type binary --output $decryptPath $encFile 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host " [OK] -> $decryptPath" -ForegroundColor Green
        } else {
            Write-Host " [FAIL]" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "[INFO] To use decrypted secrets in your shell:" -ForegroundColor Cyan
Write-Host "   Add to PowerShell profile: . `"$DECRYPT_DIR\env.fish`"" -ForegroundColor Cyan
