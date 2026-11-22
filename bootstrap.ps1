#Requires -Version 5.1

# Bootstrap script for Windows machines
# Run this after cloning the dotfiles repo:
#   git clone https://github.com/huaxel/dotfiles $HOME\dotfiles
#   cd $HOME\dotfiles
#   ./bootstrap.ps1

param(
    # Deploy configuration and hooks without installing or updating Scoop packages.
    [switch]$SkipPackages
)

$ErrorActionPreference = "Stop"

function Assert-NativeSuccess {
    param([string]$Operation)
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE"
    }
}

Write-Host "`n🚀 Setting up Windows dotfiles...`n" -ForegroundColor Cyan

# Fail before installing packages or changing configuration when required local
# secrets are unavailable. The deployment step validates decryption later.
$ageKeyPath = Join-Path $HOME ".config\sops\age\keys.txt"
if (-not (Test-Path -LiteralPath $ageKeyPath -PathType Leaf)) {
    throw "Age key not found at $ageKeyPath. Restore the existing key before running bootstrap."
}
$requiredSecrets = @(
    "environment.d.enc",
    "llama-webui-config.json.enc",
    "pi-quota-sessions.json.enc"
)
foreach ($secret in $requiredSecrets) {
    $secretPath = Join-Path $PSScriptRoot (Join-Path "secrets" $secret)
    if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
        throw "Required encrypted secret is missing: $secretPath"
    }
}

# --- Scoop ---
if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Scoop..." -ForegroundColor Yellow
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
    if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
        throw "Scoop installation completed without making the scoop command available"
    }
} else {
    Write-Host "Scoop already installed" -ForegroundColor Green
}

# --- Buckets ---
# Scoop's CLI returns objects (not text lines) in current versions, so the old
# regex-over-output check silently reported everything as missing. Resolve names
# once from the CLI and keep a filesystem fallback; never parse rendered tables.
$script:ScoopRoot = if ($env:SCOOP) { $env:SCOOP } else { Join-Path $HOME 'scoop' }
$script:ScoopBucketNames = $null
$script:ScoopAppNames = $null

function Get-ScoopBucketNames {
    if ($null -eq $script:ScoopBucketNames) {
        $script:ScoopBucketNames = @(scoop bucket list 2>$null 6>$null |
            Where-Object { $_.PSObject.Properties.Name -contains 'Name' } |
            ForEach-Object { $_.Name })
    }
    return $script:ScoopBucketNames
}

function Get-ScoopAppNames {
    if ($null -eq $script:ScoopAppNames) {
        $script:ScoopAppNames = @(scoop list 2>$null 6>$null |
            Where-Object { $_.PSObject.Properties.Name -contains 'Name' } |
            ForEach-Object { $_.Name })
    }
    return $script:ScoopAppNames
}

function Test-ScoopBucket {
    param([string[]]$Name)
    foreach ($candidate in $Name) {
        if (-not $candidate) { continue }
        if (Test-Path -LiteralPath (Join-Path $script:ScoopRoot "buckets\$candidate") -PathType Container) { return $true }
        if (Get-ScoopBucketNames | Where-Object { $_ -eq $candidate }) { return $true }
    }
    return $false
}

Write-Host "Adding Scoop buckets..." -ForegroundColor Yellow
$buckets = @("main", "extras", "nerd-fonts")
foreach ($bucket in $buckets) {
    if (-not (Test-ScoopBucket $bucket)) {
        scoop bucket add $bucket
        Assert-NativeSuccess "Adding Scoop bucket '$bucket'"
    }
}

# Custom bucket for HuggingFaceModelDownloader. Scoop names URL-only buckets
# "<owner>_<repo>", so accept that form too and avoid a duplicate clone.
$customBuckets = @{
    "cesaryuan/scoop-cesar" = "https://github.com/cesaryuan/scoop-cesar"
}
foreach ($alias in $customBuckets.Keys) {
    $owner, $repo = $alias.Split('/')
    $name = $repo
    $autoName = "${owner}_$repo"
    if (-not (Test-ScoopBucket @($name, $autoName))) {
        scoop bucket add $name $customBuckets[$alias]
        Assert-NativeSuccess "Adding Scoop bucket '$name'"
    }
}

# --- Packages ---
Write-Host "Installing packages via Scoop..." -ForegroundColor Yellow
$packages = @(
    # Core tools. pwsh is intentionally absent: PowerShell 7 ships machine-wide
    # (C:\Program Files\PowerShell\7) and a Scoop copy alongside it only creates a
    # second, PATH-ambiguous install. Re-add "pwsh" here for machines without it.
    "git", "neovim", "nodejs", "python", "rust"
    # Shell, prompt, and fonts used by Windows Terminal
    # NOTE: the manifest is "nu" — "nushell" does not exist in any bucket.
    "nu", "starship", "zoxide", "atuin", "fzf"
    "JetBrainsMono-NF", "FiraCode-NF"
    # File management
    "eza", "bat", "fd", "ripgrep", "yazi"
    # System info
    "btop", "bottom", "fastfetch", "procs", "dust", "duf"
    # Dev tools
    "gh", "jq", "glow", "viddy", "just", "lazygit", "uv"
    # Browser & launcher (zen-browser intentionally dropped: not used)
    "flow-launcher"
    # Encryption
    "age", "gpg", "sops"
    # AI tools
    "opencode", "pi-coding-agent", "claude"
    # llama inference server + model downloader
    "llama.cpp-vulkan", "HuggingFaceModelDownloader"
    # Databases
    "sqlite"
    # Compilers
    "gcc"
    # Clipboard
    "ditto"
    # Key remap
    "autohotkey"
    # Package managers
    "pnpm"
    # Utilities
    "7zip", "less", "curl", "tar", "make"
    "wget", "tree"
)

function Test-ScoopPackage {
    param([string]$Name)
    # Authoritative: what Scoop reports. Fallback: the app's version link on disk
    # (covers a package whose manifest was renamed but is still installed).
    if (Get-ScoopAppNames | Where-Object { $_ -eq $Name }) { return $true }
    return (Test-Path -LiteralPath (Join-Path $script:ScoopRoot "apps\$Name\current") -PathType Container)
}

if ($SkipPackages) {
    Write-Host "Skipping Scoop package installation (-SkipPackages)" -ForegroundColor Yellow
    $toInstall = @($packages | Where-Object { -not (Test-ScoopPackage $_) })
    if ($toInstall.Count -gt 0) {
        Write-Host ("  not installed ({0}): {1}" -f $toInstall.Count, ($toInstall -join ", ")) -ForegroundColor DarkGray
    }
} else {
foreach ($pkg in $packages) {
    if (-not (Test-ScoopPackage $pkg)) {
        Write-Host "  Installing $pkg" -ForegroundColor Gray
        scoop install $pkg
        Assert-NativeSuccess "Installing Scoop package '$pkg'"
    } else {
        Write-Host "  Already installed: $pkg" -ForegroundColor DarkGray
    }
}
}

# --- Git integration and configuration ---
$repoRoot = $PSScriptRoot
Push-Location $repoRoot
try {
    if (Test-Path -LiteralPath ".githooks") {
        git config core.hooksPath .githooks
        Assert-NativeSuccess "Configuring Git hooks"
        Write-Host "Git hooks enabled from .githooks/" -ForegroundColor Green
    }
    git config pull.rebase true
    Assert-NativeSuccess "Configuring Git pull behavior"
    # Keep filter commands free of embedded double quotes: Windows PowerShell 5.1
    # mangles them when passing to a native exe, so `node "$(git rev-parse ...)"`
    # arrives as two arguments and git exits 129 ("no action specified").
    # Git runs clean/smudge filters with cwd at the worktree root, so a relative
    # path is both correct and quoting-proof.
    git config filter.strip-pi-machine-config.clean 'node scripts/strip-pi-machine-config.mjs'
    Assert-NativeSuccess "Configuring Pi clean filter"
    git config filter.strip-pi-machine-config.smudge 'node scripts/strip-pi-machine-config.mjs 2>/dev/null || cat'
    Assert-NativeSuccess "Configuring Pi smudge filter"

    Write-Host "`nDeploying native Windows configuration..." -ForegroundColor Yellow
    & (Join-Path $repoRoot "scripts\deploy-windows.ps1")
}
finally {
    Pop-Location
}

Write-Host "`n Windows dotfiles deployed successfully!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  - Restart PowerShell or run: . `$PROFILE"
Write-Host "  - For llama.cpp: cd ~/.config/llama.cpp && .\start-server.ps1"
Write-Host "  - For WSL setup, run: ./bootstrap.sh (inside WSL)"
Write-Host ""
