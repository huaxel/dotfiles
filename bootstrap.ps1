#Requires -Version 5.1

# Bootstrap script for Windows machines
# Run this after cloning the dotfiles repo:
#   git clone https://github.com/huaxel/dotfiles ~/dotfiles
#   cd ~/dotfiles
#   ./bootstrap.ps1

$ErrorActionPreference = "Stop"

Write-Host "`n🚀 Setting up Windows dotfiles...`n" -ForegroundColor Cyan

# --- Scoop ---
if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Scoop..." -ForegroundColor Yellow
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
} else {
    Write-Host "Scoop already installed" -ForegroundColor Green
}

# --- Buckets ---
Write-Host "Adding Scoop buckets..." -ForegroundColor Yellow
$buckets = @("main", "extras")
foreach ($bucket in $buckets) {
    $existing = scoop bucket list | Select-String -Pattern "^$bucket$"
    if (-not $existing) {
        scoop bucket add $bucket
    }
}

# Custom bucket for HuggingFaceModelDownloader
$customBuckets = @{
    "cesaryuan/scoop-cesar" = "https://github.com/cesaryuan/scoop-cesar"
}
foreach ($alias in $customBuckets.Keys) {
    $name = $alias.Split('/')[1]
    $existing = scoop bucket list | Select-String -Pattern "^$name$"
    if (-not $existing) {
        scoop bucket add $alias $customBuckets[$alias]
    }
}

# --- Packages ---
Write-Host "Installing packages via Scoop..." -ForegroundColor Yellow
$packages = @(
    # Core tools
    "git", "pwsh", "neovim", "nodejs", "python", "rust"
    # Shell & prompt
    "starship", "zoxide", "atuin", "fzf"
    # File management
    "eza", "bat", "fd", "ripgrep", "yazi"
    # System info
    "btop", "fastfetch", "procs", "dust", "duf"
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

foreach ($pkg in $packages) {
    $installed = scoop list | Select-String -Pattern "^$pkg\s"
    if (-not $installed) {
        Write-Host "  Installing $pkg" -ForegroundColor Gray
        scoop install $pkg
    } else {
        Write-Host "  Already installed: $pkg" -ForegroundColor DarkGray
    }
}

# --- Dotter ---
if (-not (Get-Command dotter -ErrorAction SilentlyContinue)) {
    Write-Host "`nInstalling dotter..." -ForegroundColor Yellow
    cargo install dotter
}

# --- Deploy ---
Write-Host "`nDeploying dotfiles with dotter..." -ForegroundColor Yellow
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Push-Location $repoRoot

# Create machine-local Dotter config on fresh clones
if (-not (Test-Path ".dotter/local.toml")) {
    $gitName = (git config --global user.name 2>$null)
    if (-not $gitName) { $gitName = "Your Name" }
    $gitEmail = (git config --global user.email 2>$null)
    if (-not $gitEmail) { $gitEmail = "your@email.com" }
    $gitName = $gitName.Replace('"', '\"')
    $gitEmail = $gitEmail.Replace('"', '\"')

@"
packages = ["default", "windows"]

[variables]
os = "windows"
name = "$gitName"
email = "$gitEmail"
hostname_color = "fg:#f7768e"
models_base_path = "$env:USERPROFILE\.cache\huggingface\hub"
"@ | Set-Content -Path ".dotter/local.toml" -Encoding UTF8
    Write-Host "Created .dotter/local.toml for windows" -ForegroundColor Green
}

dotter deploy

# --- Secrets ---
Write-Host "`nDecrypting secrets..." -ForegroundColor Yellow
. .\.dotter\post_deploy.ps1

Pop-Location

Write-Host "`n Windows dotfiles deployed successfully!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  - Restart PowerShell or run: . `$PROFILE"
Write-Host "  - Start GlazeWM: glazewm"
Write-Host "  - Start Zebar: zebar"
Write-Host "  - For llama.cpp: cd ~/.config/llama.cpp && .\start-server.ps1"
Write-Host "  - For WSL setup, run: ./bootstrap.sh (inside WSL)"
Write-Host ""
