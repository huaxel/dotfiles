# PowerShell 5.1 Profile
# Source: ~/dotfiles/powershell/5.1/profile.ps1

$InteractiveSession = -not [Console]::IsInputRedirected -and -not [Console]::IsOutputRedirected

# Starship Prompt
$env:STARSHIP_CONFIG = "$env:USERPROFILE\.config\starship.toml"
if ($InteractiveSession -and (Get-Command starship -ErrorAction SilentlyContinue)) {
    Invoke-Expression (& starship init powershell)
}

# PSReadLine. PredictionSource requires newer PSReadLine than some Windows
# PowerShell 5.1 installations provide, so keep it optional.
if ($InteractiveSession -and (Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue)) {
    try { Set-PSReadLineOption -PredictionSource History -ErrorAction Stop } catch {}
    Set-PSReadLineOption -EditMode Windows
    Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
}

# Aliases. Windows PowerShell 5.1 ships `cat` as an AllScope alias, so
# overriding it needs -Force -Option AllScope; guard on the target existing so
# a missing tool never aborts the profile.
function Set-ProfileAlias {
    param([string]$Name, [string]$Value)
    if (-not (Get-Command $Value -ErrorAction SilentlyContinue)) { return }
    Set-Alias -Name $Name -Value $Value -Force -Option AllScope -Scope Global
}

Set-ProfileAlias vim nvim
Set-ProfileAlias vi nvim
Set-ProfileAlias g git
Set-ProfileAlias cat bat

# Utility Functions
function .. { Set-Location .. }
function ... { Set-Location ../.. }
function gs { git status -sb }
function gl { git log --oneline --graph --decorate -20 }
function gca($msg) { git add -A; git commit -m $msg }
function ep { code $PROFILE }
function rp { . $PROFILE }

# llama.cpp inference server
function llama-serve {
  & "$env:USERPROFILE\.config\llama.cpp\start-server.ps1" @args
}

# Environment Variables
$DotfilesRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:PI_CODING_AGENT_DIR = (Join-Path $DotfilesRoot "pi\agent")
$env:PI_CODING_AGENT_SESSION_DIR = (Join-Path $DotfilesRoot "pi\agent\sessions")

$SecretsLoader = Join-Path $DotfilesRoot "powershell\Load-Secrets.ps1"
if (Test-Path -LiteralPath $SecretsLoader) {
    . $SecretsLoader
    Import-DotfilesSecrets
}

# Window Title
$host.ui.RawUI.WindowTitle = "PowerShell 5.1 | $env:USERNAME@$env:COMPUTERNAME"
