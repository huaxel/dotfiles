#Requires -Version 5.1

# Bootstrap script for Windows machines
# Run this after cloning the dotfiles repo:
#   git clone https://github.com/huaxel/dotfiles $HOME\dotfiles
#   cd $HOME\dotfiles
#   ./bootstrap.ps1

$ErrorActionPreference = "Stop"

function Assert-NativeSuccess {
    param([string]$Operation)
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE"
    }
}

Write-Host "`n🚀 Setting up Windows dotfiles...`n" -ForegroundColor Cyan

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
function Test-ScoopBucket {
    param([string]$Name)
    $pattern = "^\s*$([regex]::Escape($Name))(\s|$)"
    return [bool](scoop bucket list | Select-String -Pattern $pattern)
}

Write-Host "Adding Scoop buckets..." -ForegroundColor Yellow
$buckets = @("main", "extras", "nerd-fonts")
foreach ($bucket in $buckets) {
    if (-not (Test-ScoopBucket $bucket)) {
        scoop bucket add $bucket
        Assert-NativeSuccess "Adding Scoop bucket '$bucket'"
    }
}

# Custom bucket for HuggingFaceModelDownloader
$customBuckets = @{
    "cesaryuan/scoop-cesar" = "https://github.com/cesaryuan/scoop-cesar"
}
foreach ($alias in $customBuckets.Keys) {
    $name = $alias.Split('/')[1]
    if (-not (Test-ScoopBucket $name)) {
        scoop bucket add $name $customBuckets[$alias]
        Assert-NativeSuccess "Adding Scoop bucket '$name'"
    }
}

# --- Packages ---
Write-Host "Installing packages via Scoop..." -ForegroundColor Yellow
$packages = @(
    # Core tools
    "git", "pwsh", "neovim", "nodejs", "python", "rust"
    # Shell, prompt, and fonts used by Windows Terminal
    "nushell", "starship", "zoxide", "atuin", "fzf"
    "JetBrainsMono-NF", "FiraCode-NF"
    # File management
    "eza", "bat", "fd", "ripgrep", "yazi"
    # System info
    "btop", "bottom", "fastfetch", "procs", "dust", "duf"
    # Dev tools
    "gh", "jq", "glow", "viddy", "just", "lazygit", "uv"
    # Window manager
    "glazewm", "zebar"
    # Browser & launcher
    "zen-browser", "flow-launcher"
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
    $pattern = "^\s*$([regex]::Escape($Name))(\s|$)"
    return [bool](scoop list | Select-String -Pattern $pattern)
}

foreach ($pkg in $packages) {
    if (-not (Test-ScoopPackage $pkg)) {
        Write-Host "  Installing $pkg" -ForegroundColor Gray
        scoop install $pkg
        Assert-NativeSuccess "Installing Scoop package '$pkg'"
    } else {
        Write-Host "  Already installed: $pkg" -ForegroundColor DarkGray
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
Write-Host "  - Start GlazeWM: glazewm"
Write-Host "  - Start Zebar: zebar"
Write-Host "  - For llama.cpp: cd ~/.config/llama.cpp && .\start-server.ps1"
Write-Host "  - For WSL setup, run: ./bootstrap.sh (inside WSL)"
Write-Host ""
