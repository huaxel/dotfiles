# Post-deploy hook: decrypt secrets with sops (Windows)
# Run manually after `dotter deploy`, or integrate into bootstrap.ps1:
#   . .\.dotter\post_deploy.ps1
#
# Requires: scoop install age sops

$DOTFILES_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$SECRETS_DIR = Join-Path $DOTFILES_DIR "secrets"
$DECRYPT_DIR = "$env:USERPROFILE\.config\secrets"

# Check if sops and age are available
if (-not (Get-Command sops -ErrorAction SilentlyContinue) -or `
    -not (Get-Command age -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  sops or age not found — install with: scoop install age sops" -ForegroundColor Yellow
    return
}

# Check if age key exists
$ageKeyPath = "$env:USERPROFILE\.config\sops\age\keys.txt"
if (-not (Test-Path $ageKeyPath)) {
    Write-Host "⚠️  Age key not found at $ageKeyPath" -ForegroundColor Yellow
    Write-Host "   Generate one with: age-keygen -o $ageKeyPath" -ForegroundColor Yellow
    return
}

# Decrypt secrets
if (Test-Path $SECRETS_DIR) {
    New-Item -ItemType Directory -Force -Path $DECRYPT_DIR | Out-Null

    Get-ChildItem "$SECRETS_DIR\*.enc" -File | ForEach-Object {
        $encFile = $_.FullName
        $filename = $_.BaseName  # name without .enc

        # App-specific secrets decrypt to their real config path
        switch ($filename) {
            "llama-webui-config.json" {
                $dest = "$env:USERPROFILE\.config\llama.cpp\webui-config.json"
                New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
                Write-Host "🔐 Decrypting $filename..." -NoNewline
                $result = & sops --decrypt --output-type binary $encFile 2>$null
                if ($LASTEXITCODE -eq 0) {
                    [System.IO.File]::WriteAllBytes($dest, $result)
                    attrib +R $dest  # equivalent to chmod 600 on NTFS
                    Write-Host " ✅ -> $dest" -ForegroundColor Green
                } else {
                    Write-Host " ❌ Failed" -ForegroundColor Red
                }
                continue
            }
        }

        $decryptPath = "$DECRYPT_DIR\$filename"
        Write-Host "🔐 Decrypting $filename..." -NoNewline
        $result = & sops --decrypt --output-type binary $encFile 2>$null
        if ($LASTEXITCODE -eq 0) {
            [System.IO.File]::WriteAllBytes($decryptPath, $result)
            attrib +R $decryptPath
            Write-Host " ✅ -> $decryptPath" -ForegroundColor Green
        } else {
            Write-Host " ❌ Failed" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "💡 To use decrypted secrets in your shell:" -ForegroundColor Cyan
Write-Host "   Add to PowerShell profile: . `"$DECRYPT_DIR\env.fish`"" -ForegroundColor Cyan
