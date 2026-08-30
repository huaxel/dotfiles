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
$PI_AGENT_DIR = if ($env:PI_CODING_AGENT_DIR) {
    $env:PI_CODING_AGENT_DIR
} else {
    Join-Path $DOTFILES_DIR "pi\agent"
}
$DEFAULT_PI_AGENT_DIR = Join-Path $env:USERPROFILE ".pi\agent"

$appSecrets = @{
    "llama-webui-config.json" = [System.IO.Path]::Combine($env:USERPROFILE, ".config", "llama.cpp", "webui-config.json")
    # auth.json is intentionally NOT synced/decrypted: OAuth refresh tokens rotate
    # per refresh, so a shared credential desyncs across machines. Each machine
    # owns its own gitignored pi\agent\auth.json and logs in via `/login openai-codex`.
    "pi-quota-sessions.json" = Join-Path $PI_AGENT_DIR "quota-sessions.json"
    "environment.d" = [System.IO.Path]::Combine($env:USERPROFILE, ".config", "environment.d", "99-environment.conf")
}

function Sync-CompatAuth {
    param(
        [string]$Source,
        [string]$CompatPath
    )

    if (([System.IO.Path]::GetFullPath($Source)).Equals(([System.IO.Path]::GetFullPath($CompatPath)), [System.StringComparison]::OrdinalIgnoreCase)) {
        return
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $CompatPath -Parent) | Out-Null
    Copy-Item -Force $Source $CompatPath
}

function Invoke-SopsDecrypt {
    param(
        [string]$Source,
        [string]$Destination
    )

    $parent = Split-Path $Destination -Parent
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if (Test-Path $Destination) { attrib -R $Destination }

    $leafBase = [System.IO.Path]::GetFileNameWithoutExtension($Source)
    $temporary = Join-Path $parent (".$leafBase.$([Guid]::NewGuid().ToString('N')).tmp")
    Write-Host "[...] Decrypting $leafBase..." -NoNewline
    & sops --decrypt --output-type binary --output $temporary $Source 2>$null
    if ($LASTEXITCODE -eq 0) {
        Move-Item -Force $temporary $Destination
        Write-Host " [OK] -> $Destination" -ForegroundColor Green
    } else {
        Remove-Item -Force -ErrorAction SilentlyContinue $temporary
        Write-Host " [FAIL]" -ForegroundColor Red
    }
}

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

    foreach ($file in Get-ChildItem "$SECRETS_DIR\*.enc" -File) {
        $encFile = $file.FullName
        $filename = $file.BaseName  # name without .enc

        if ($appSecrets.ContainsKey($filename)) {
            continue
        }

        $decryptPath = [System.IO.Path]::Combine($DECRYPT_DIR, $filename)
        Invoke-SopsDecrypt -Source $encFile -Destination $decryptPath
    }

    foreach ($entry in $appSecrets.GetEnumerator()) {
        $encFile = Join-Path $SECRETS_DIR ($entry.Key + ".enc")
        if (Test-Path $encFile) {
            Invoke-SopsDecrypt -Source $encFile -Destination $entry.Value
        }
    }

    $compatAuth = Join-Path $DEFAULT_PI_AGENT_DIR "auth.json"
    $sourceAuth = Join-Path $PI_AGENT_DIR "auth.json"
    if (Test-Path $sourceAuth) {
        Sync-CompatAuth -Source $sourceAuth -CompatPath $compatAuth
    }
}

Write-Host ""
Write-Host "[INFO] Secrets decrypted to ~/.config/environment.d and ~/.config/secrets/." -ForegroundColor Cyan
Write-Host "   PowerShell profiles source the environment.d file automatically via Load-Secrets.ps1." -ForegroundColor Cyan
