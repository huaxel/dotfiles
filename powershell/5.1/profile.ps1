# PowerShell 5.1 Profile
# Source: ~/dotfiles/powershell/5.1/profile.ps1

# Starship Prompt
$env:STARSHIP_CONFIG = "$env:USERPROFILE\.config\starship.toml"
Invoke-Expression (&starship init powershell)

# PSReadLine
Set-PSReadLineOption -PredictionSource History
Set-PSReadLineOption -EditMode Windows
Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete

# Aliases
Set-Alias -Name vim -Value nvim
Set-Alias -Name vi -Value nvim
Set-Alias -Name g -Value git
Set-Alias -Name cat -Value bat

# Utility Functions
function .. { Set-Location .. }
function ... { Set-Location ../.. }
function gs { git status -sb }
function gl { git log --oneline --graph --decorate -20 }
function gca($msg) { git add -A; git commit -m $msg }
function ep { code $PROFILE }
function rp { . $PROFILE }

# Window Title
$host.ui.RawUI.WindowTitle = "PowerShell 5.1 | $env:USERNAME@$env:COMPUTERNAME"
