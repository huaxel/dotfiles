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
    Write-Host "✅ Scoop already installed" -ForegroundColor Green
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

# --- Packages ---
Write-Host "Installing packages via Scoop..." -ForegroundColor Yellow
$packages = @(
    # Core tools
    "git", "pwsh", "neovim", "vscode", "node", "python", "rust"
    # Shell & prompt
    "starship", "zoxide", "atuin", "fzf"
    # File management
    "eza", "bat", "yazi", "broot", "fd", "ripgrep"
    # System info
    "btop", "fastfetch", "procs", "dust", "duf"
    # Dev tools
    "gh", "jq", "glow", "viddy", "just", "lazygit", "uv"
    # Terminal multiplexer
    "zellij"
    # Window manager
    "glazewm", "zebar"
    # Browser & launcher
    "zen-browser", "flow-launcher"
    # Encryption
    "age", "gpg", "sops"
    # AI tools
    "opencode", "pi-coding-agent"
    # Key remap
    "autohotkey"
    # Utilities
    "7zip", "less", "curl", "tar", "make"
)

foreach ($pkg in $packages) {
    $installed = scoop list | Select-String -Pattern "^$pkg\s"
    if (-not $installed) {
        Write-Host "  📦 $pkg" -ForegroundColor Gray
        scoop install $pkg
    } else {
        Write-Host "  ✅ $pkg" -ForegroundColor DarkGray
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
"@ | Set-Content -Path ".dotter/local.toml" -Encoding UTF8
    Write-Host "Created .dotter/local.toml for windows" -ForegroundColor Green
}

dotter deploy
Pop-Location

Write-Host "`n✅ Windows dotfiles deployed successfully!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  - Restart PowerShell or run: . `$PROFILE"
Write-Host "  - Start GlazeWM: glazewm"
Write-Host "  - Start Zebar: zebar"
Write-Host "  - For WSL setup, run: ./bootstrap.sh (inside WSL)"
Write-Host ""
