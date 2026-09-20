#Requires -Version 5.1

# Decrypt sops/age secrets for native Windows.
# Requires: scoop install age sops
# NOTE: Keep this file ASCII-safe (no emoji) for Windows PowerShell.

$DOTFILES_DIR = Split-Path -Parent $PSScriptRoot
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
    Copy-Item -LiteralPath $Source -Destination $CompatPath -Force
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
        Move-Item -LiteralPath $temporary -Destination $Destination -Force
        Write-Host " [OK] -> $Destination" -ForegroundColor Green
    } else {
        Remove-Item -Force -ErrorAction SilentlyContinue $temporary
        Write-Host " [FAIL]" -ForegroundColor Red
        throw "Failed to decrypt $Source"
    }
}

# Check if sops and age are available
if (-not (Get-Command sops -ErrorAction SilentlyContinue) -or `
    -not (Get-Command age -ErrorAction SilentlyContinue)) {
    throw "sops or age not found -- install with: scoop install age sops"
}

# Check if age key exists
$ageKeyPath = "$env:USERPROFILE\.config\sops\age\keys.txt"
if (-not (Test-Path $ageKeyPath)) {
    throw "Age key not found at $ageKeyPath. Restore the existing key before deployment."
}

# sops on Windows does not auto-detect ~/.config/sops/age/keys.txt
# so we must set SOPS_AGE_KEY_FILE explicitly
$env:SOPS_AGE_KEY_FILE = $ageKeyPath

# Decrypt secrets
if (-not (Test-Path -LiteralPath $SECRETS_DIR)) {
    throw "Secrets directory not found: $SECRETS_DIR"
}
if (Test-Path $SECRETS_DIR) {
    New-Item -ItemType Directory -Force -Path $DECRYPT_DIR | Out-Null

    foreach ($file in Get-ChildItem -Path "$SECRETS_DIR\*.enc" -File) {
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
        if (-not (Test-Path -LiteralPath $encFile)) {
            throw "Required encrypted secret is missing: $encFile"
        }
        Invoke-SopsDecrypt -Source $encFile -Destination $entry.Value
    }

    $compatAuth = Join-Path $DEFAULT_PI_AGENT_DIR "auth.json"
    $sourceAuth = Join-Path $PI_AGENT_DIR "auth.json"
    if (Test-Path $sourceAuth) {
        Sync-CompatAuth -Source $sourceAuth -CompatPath $compatAuth
    }

    # Mirror settings.json into the default config dir so pi behaves
    # identically when launched without PI_CODING_AGENT_DIR. The tracked file
    # is the source of truth; the git clean filter strips machine-local fields.
    $compatSettings = Join-Path $DEFAULT_PI_AGENT_DIR "settings.json"
    $sourceSettings = Join-Path $PI_AGENT_DIR "settings.json"
    if (Test-Path $sourceSettings) {
        Sync-CompatAuth -Source $sourceSettings -CompatPath $compatSettings
    }
}

Write-Host ""
Write-Host "[INFO] Secrets decrypted to ~/.config/environment.d and ~/.config/secrets/." -ForegroundColor Cyan
Write-Host "   PowerShell profiles source the environment.d file automatically via Load-Secrets.ps1." -ForegroundColor Cyan
