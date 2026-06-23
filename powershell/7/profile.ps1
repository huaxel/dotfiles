# PowerShell Profile
# Source: ~/dotfiles/powershell/7/profile.ps1

# Scoop pwsh takes priority over old Program Files install
$env:PATH = "$env:USERPROFILE\scoop\apps\pwsh\current;$env:PATH"

# Requires: starship, fzf, PSReadLine (included in PS 7+)

# ============================
# Starship Prompt
# ============================
$env:STARSHIP_CONFIG = "$env:USERPROFILE\.config\starship.toml"
Invoke-Expression (&starship init powershell)

# ============================
# PSReadLine Configuration
# ============================
Set-PSReadLineOption -PredictionSource History
Set-PSReadLineOption -PredictionViewStyle ListView
Set-PSReadLineOption -EditMode Windows

Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward
Set-PSReadLineKeyHandler -Chord 'Ctrl+d' -Function DeleteChar

# ============================
# FZF Integration
# ============================
Set-PSReadLineKeyHandler -Chord 'Ctrl+r' -ScriptBlock {
    $command = Get-Content (Get-PSReadlineOption).HistorySavePath |
        Select-Object -Unique |
        fzf --height 40% --reverse
    if ($command) {
        [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
        [Microsoft.PowerShell.PSConsoleReadLine]::Insert($command)
    }
}

function fd() {
    $dir = Get-ChildItem -Directory -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object { $_.FullName } |
        fzf --height 40% --reverse
    if ($dir) { Set-Location $dir }
}

function ff() {
    fzf --height 60% --reverse --preview 'bat --color=always --style=numbers --line-range=:500 {}' |
        ForEach-Object { Invoke-Item $_ }
}

# ============================
# Aliases
# ============================
Set-Alias -Name vim -Value nvim
Set-Alias -Name vi -Value nvim
Set-Alias -Name g -Value git
Set-Alias -Name cat -Value bat
Set-Alias -Name ls -Value eza -ErrorAction SilentlyContinue
Set-Alias -Name ll -Value 'eza -la' -ErrorAction SilentlyContinue

# ============================
# Modern Tool Aliases
# ============================
if (Get-Command procs -ErrorAction SilentlyContinue) {
    Set-Alias -Name ps -Value procs -ErrorAction SilentlyContinue
}
if (Get-Command dust -ErrorAction SilentlyContinue) {
    Set-Alias -Name du -Value dust -ErrorAction SilentlyContinue
}
if (Get-Command duf -ErrorAction SilentlyContinue) {
    Set-Alias -Name df -Value duf -ErrorAction SilentlyContinue
}
if (Get-Command glow -ErrorAction SilentlyContinue) {
    Set-Alias -Name md -Value glow -ErrorAction SilentlyContinue
}

# ============================
# Yazi Integration
# ============================
function y() {
    $tmp = New-TemporaryFile
    yazi $args --cwd-file $tmp
    if (Test-Path $tmp) {
        $cwd = Get-Content $tmp
        Remove-Item $tmp
        if ($cwd -ne "") {
            Set-Location $cwd
        }
    }
}

# ============================
# Utility Functions
# ============================
function .. { Set-Location .. }
function ... { Set-Location ../.. }
function .... { Set-Location ../../.. }

function ep { code $PROFILE }
function rp { . $PROFILE }

function mkcd($dir) { mkdir $dir -ErrorAction SilentlyContinue; Set-Location $dir }

function gs { git status -sb }
function gl { git log --oneline --graph --decorate -20 }
function gca($msg) { git add -A; git commit -m $msg }

function killp($name) {
    $proc = Get-Process | Where-Object { $_.Name -like "*$name*" }
    if ($proc) {
        $proc | Stop-Process -Force
        Write-Host "Killed $($proc.Name)" -ForegroundColor Green
    }
}

function extract($file) {
    switch ($file) {
        (*.zip) { Expand-Archive $file }
        (*.tar.gz) { tar -xzf $file }
        (*.tar) { tar -xf $file }
        (*.7z) { 7z x $file }
        default { Write-Host "Unknown archive type" }
    }
}

function weather($city = "Brussels") {
    curl -s "wttr.in/$city?format=3"
}

# ============================
# Environment & Tools
# ============================
if (Get-Command uv -ErrorAction SilentlyContinue) {
    (& uv generate-shell-completion powershell) | Out-String | Invoke-Expression
}

if (Get-Command zoxide -ErrorAction SilentlyContinue) {
    Invoke-Expression (& { $hook = if ($PSVersionTable.PSVersion.Major -ge 7) { 'pwd' } else { 'prompt' } (zoxide init powershell --hook $hook) -join "`n" })
}

if (Get-Command atuin -ErrorAction SilentlyContinue) {
    (& atuin init powershell) | Out-String | Invoke-Expression
}

if (Get-Command just -ErrorAction SilentlyContinue) {
    (& just --completions powershell) | Out-String | Invoke-Expression
}

# ============================
# Environment Variables
# ============================
$env:BAT_THEME = "tokyonight_night"
$env:EZA_CONFIG_DIR = "$env:USERPROFILE\.config\eza"

# ============================
# Window Title
# ============================
$host.ui.RawUI.WindowTitle = "PowerShell | $env:USERNAME@$env:COMPUTERNAME"

# ============================
# Welcome Message
# ============================
Write-Host "`n  PowerShell $($PSVersionTable.PSVersion)" -ForegroundColor Cyan
Write-Host "  $(Get-Location)" -ForegroundColor Yellow
Write-Host "  Tip: Ctrl+r for history, 'fd' for dir search, 'ff' for file search" -ForegroundColor Gray
Write-Host ""
