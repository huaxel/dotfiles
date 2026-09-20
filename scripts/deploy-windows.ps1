#Requires -Version 5.1

<##
.SYNOPSIS
Deploy repository-managed configuration to native Windows paths.

Scoop installs the programs; this script installs their configuration links.
Windows Developer Mode (or an elevated PowerShell) is required for links.
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Get-ExistingItem {
    param([string]$Path)
    return Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Remove-Or-Backup {
    param([string]$Path)

    $existing = Get-ExistingItem $Path
    if (-not $existing) { return }

    if ($existing.LinkType) {
        # Never recurse through a directory link/junction; remove the link only.
        Remove-Item -LiteralPath $Path -Force
        return
    }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = "$Path.dotfiles-backup-$stamp-$PID"
    Move-Item -LiteralPath $Path -Destination $backup
    Write-Host "  Backed up existing $Path -> $backup" -ForegroundColor Yellow
}

function Link-Config {
    param(
        [string]$RelativeSource,
        [string]$Target
    )

    $source = Join-Path $RepoRoot $RelativeSource
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Missing configuration source: $source"
    }

    $parent = Split-Path -Parent $Target
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

    $existing = Get-ExistingItem $Target
    if ($existing -and $existing.LinkType) {
        $resolvedSource = (Resolve-Path -LiteralPath $source).Path
        $resolvedTarget = (Resolve-Path -LiteralPath $Target -ErrorAction SilentlyContinue).Path
        if ($resolvedSource -eq $resolvedTarget) {
            Write-Host "  [OK] $Target"
            return
        }
    }

    Remove-Or-Backup $Target
    New-Item -ItemType SymbolicLink -Path $Target -Target $source | Out-Null
    Write-Host "  [LINK] $Target -> $RelativeSource"
}

function Write-Generated {
    param(
        [string]$Target,
        [string]$Content
    )

    $parent = Split-Path -Parent $Target
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

    $existing = Get-ExistingItem $Target
    if ($existing -and -not $existing.LinkType -and -not $existing.PSIsContainer) {
        $current = [System.IO.File]::ReadAllText($Target)
        if ($current -eq $Content) {
            Write-Host "  [OK] $Target"
            return
        }
    }

    Remove-Or-Backup $Target
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Target, $Content, $encoding)
    Write-Host "  [WRITE] $Target"
}

function Render-Starship {
    $source = Join-Path $RepoRoot "starship.toml"
    $content = [System.IO.File]::ReadAllText($source)
    $content = $content.Replace("{{hostname_color}}", "fg:#f7768e")
    Write-Generated (Join-Path $HOME ".config\starship.toml") $content
}

function Render-LlamaModels {
    $source = Join-Path $RepoRoot "llama-models.ini"
    $base = Join-Path $HOME ".cache\huggingface\hub"
    $lines = Get-Content -LiteralPath $source
    $active = $true
    $rendered = New-Object System.Collections.Generic.List[string]

    foreach ($line in $lines) {
        if ($line -eq '{{#if (eq os "linux")}}') {
            $active = $false
            continue
        }
        if ($line -eq '{{else if (eq os "windows")}}') {
            $active = $true
            continue
        }
        if ($line -eq '{{else}}') {
            $active = $false
            continue
        }
        if ($line -eq '{{/if}}') {
            $active = $true
            continue
        }
        if ($active) {
            $rendered.Add($line.Replace('{{ models_base_path }}', $base))
        }
    }

    $content = ($rendered -join [Environment]::NewLine) + [Environment]::NewLine
    Write-Generated (Join-Path $HOME ".config\llama.cpp\models.ini") $content
}

Write-Host "Deploying native Windows configuration..." -ForegroundColor Cyan

# Preserve an existing local npm configuration before creating the repository source.
$npmrcSource = Join-Path $RepoRoot "npmrc"
$npmrcTarget = Join-Path $HOME ".npmrc"
if (-not (Test-Path -LiteralPath $npmrcSource)) {
    $existingNpmrc = Get-ExistingItem $npmrcTarget
    if ($existingNpmrc -and -not $existingNpmrc.LinkType) {
        Copy-Item -LiteralPath $npmrcTarget -Destination $npmrcSource
    } else {
        New-Item -ItemType File -Path $npmrcSource -Force | Out-Null
    }
}
Link-Config "npmrc" $npmrcTarget

$links = @(
    @{ Source = "ssh_config"; Target = (Join-Path $HOME ".ssh\config") },
    @{ Source = "gitconfig"; Target = (Join-Path $HOME ".gitconfig") },
    @{ Source = "gitignore_global"; Target = (Join-Path $HOME ".gitignore_global") },
    @{ Source = "config\mise"; Target = (Join-Path $HOME ".config\mise") },
    @{ Source = "config\herdr"; Target = (Join-Path $HOME ".config\herdr") },
    @{ Source = "config\zed\keymap.json"; Target = (Join-Path $env:LOCALAPPDATA "Zed\keymap.json") },
    @{ Source = "powershell\7\profile.ps1"; Target = (Join-Path $HOME "Documents\PowerShell\Microsoft.PowerShell_profile.ps1") },
    @{ Source = "powershell\5.1\profile.ps1"; Target = (Join-Path $HOME "Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1") },
    @{ Source = "windows-terminal\settings.json"; Target = (Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json") },
    @{ Source = "autohotkey\mac-layout.ahk"; Target = (Join-Path $HOME ".config\autohotkey\mac-layout.ahk") },
    @{ Source = "flow-launcher\README.md"; Target = (Join-Path $HOME ".config\flow-launcher\README.md") },
    @{ Source = "glazewm\config.yaml"; Target = (Join-Path $HOME ".glzr\glazewm\config.yaml") },
    @{ Source = "zebar\settings.json"; Target = (Join-Path $HOME ".glzr\zebar\settings.json") },
    @{ Source = "zebar\bar"; Target = (Join-Path $HOME ".glzr\zebar\bar") },
    @{ Source = "config\nvim"; Target = (Join-Path $HOME "AppData\Local\nvim") },
    @{ Source = "config\llama.cpp\start-server.ps1"; Target = (Join-Path $HOME ".config\llama.cpp\start-server.ps1") },
    @{ Source = "config\llama.cpp\README-windows.md"; Target = (Join-Path $HOME ".config\llama.cpp\README.md") },
    @{ Source = "config\bat"; Target = (Join-Path $HOME ".config\bat") },
    @{ Source = "config\btop"; Target = (Join-Path $HOME ".config\btop") },
    @{ Source = "config\eza"; Target = (Join-Path $HOME ".config\eza") },
    @{ Source = "config\nushell"; Target = (Join-Path $env:APPDATA "nushell") },
    @{ Source = "config\fastfetch"; Target = (Join-Path $HOME ".config\fastfetch") }
)

foreach ($link in $links) {
    Link-Config $link.Source $link.Target
}

Render-Starship
Render-LlamaModels

# Invoke helpers in the current PowerShell so this works from either Windows
# PowerShell 5.1 or PowerShell 7 without depending on powershell.exe lookup.
& (Join-Path $PSScriptRoot "sync-agent-state.ps1")
& (Join-Path $PSScriptRoot "deploy-secrets.ps1")

Write-Host "Windows configuration deployed successfully." -ForegroundColor Green
