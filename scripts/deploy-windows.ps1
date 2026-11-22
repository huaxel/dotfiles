#Requires -Version 5.1

<##
.SYNOPSIS
Deploy repository-managed configuration to native Windows paths.

Scoop installs the programs; this script deploys their configuration.
Symlinks are preferred; junctions and refreshed file copies are used when Windows denies symlink creation.
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Get-ExistingItem {
    param([string]$Path)
    return Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Get-FileDigest {
    param([string]$Path)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return [System.BitConverter]::ToString($sha256.ComputeHash($stream))
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

function Remove-Or-Backup {
    param([string]$Path)

    $existing = Get-ExistingItem $Path
    if (-not $existing) { return }

    if ($existing.LinkType) {
        # Windows PowerShell's Remove-Item can prompt for nonempty junctions.
        # Directory.Delete without recursion removes only the directory link.
        if ($existing.PSIsContainer) {
            [System.IO.Directory]::Delete($Path)
        } else {
            Remove-Item -LiteralPath $Path -Force
        }
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
        # Resolve-Path on Windows can return the junction path, not its target.
        $linkTarget = @($existing.Target)[0]
        if ($linkTarget) {
            if (-not [System.IO.Path]::IsPathRooted($linkTarget)) {
                $linkTarget = Join-Path (Split-Path -Parent $Target) $linkTarget
            }
            if ([System.IO.Path]::GetFullPath($linkTarget) -eq $resolvedSource) {
                Write-Host "  [OK] $Target"
                return
            }
        }
        $resolvedTarget = (Resolve-Path -LiteralPath $Target -ErrorAction SilentlyContinue).Path
        if ($resolvedSource -eq $resolvedTarget) {
            Write-Host "  [OK] $Target"
            return
        }
    }

    if ($existing -and -not $existing.LinkType -and -not $existing.PSIsContainer -and
        -not (Get-Item -LiteralPath $source).PSIsContainer) {
        $sourceHash = Get-FileDigest $source
        $targetHash = Get-FileDigest $Target
        if ($sourceHash -eq $targetHash) {
            Write-Host "  [OK] $Target (copy is current)"
            return
        }
    }

    Remove-Or-Backup $Target
    try {
        New-Item -ItemType SymbolicLink -Path $Target -Target $source -ErrorAction Stop | Out-Null
        Write-Host "  [LINK] $Target -> $RelativeSource"
        return
    } catch {
        # Without Developer Mode or SeCreateSymbolicLinkPrivilege, Windows
        # cannot create symlinks. Junctions work for directories without admin;
        # individual files are copied and refreshed on each deployment.
        if ((Get-Item -LiteralPath $source).PSIsContainer) {
            $command = 'mklink /J "' + $Target + '" "' + $source + '"'
            & cmd.exe /d /c $command | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  [JUNCTION] $Target -> $RelativeSource"
                return
            }
            throw "Could not create a directory junction for $Target"
        }

        $existing = Get-ExistingItem $Target
        if ($existing -and -not $existing.PSIsContainer) {
            $sourceHash = Get-FileDigest $source
            $targetHash = Get-FileDigest $Target
            if ($sourceHash -eq $targetHash) {
                Write-Host "  [OK] $Target (copy is current)"
                return
            }
            Remove-Or-Backup $Target
        }
        Copy-Item -LiteralPath $source -Destination $Target -Force
        Write-Host "  [COPY] $Target <- $RelativeSource (refresh with just windows-deploy)"
    }
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

function Render-WindowsGitConfig {
    $source = Join-Path $RepoRoot "gitconfig"
    $lines = [System.IO.File]::ReadAllLines($source)
    $rendered = New-Object System.Collections.Generic.List[string]
    $frames = New-Object System.Collections.Generic.Stack[object]
    $active = $true

    foreach ($line in $lines) {
        if ($line -match '^\s*{{#if \(eq os "(linux|macos|windows)"\)}}\s*$') {
            $condition = $Matches[1] -eq "windows"
            $frames.Push(@{ Parent = $active; Taken = $condition })
            $active = $active -and $condition
            continue
        }
        if ($line -match '^\s*{{else if \(eq os "(linux|macos|windows)"\)}}\s*$') {
            if ($frames.Count -eq 0) { throw "Unexpected Git config template branch: $line" }
            $frame = $frames.Peek()
            $condition = -not $frame.Taken -and $Matches[1] -eq "windows"
            $frame.Taken = $frame.Taken -or $condition
            $active = $frame.Parent -and $condition
            continue
        }
        if ($line -match '^\s*{{else}}\s*$') {
            if ($frames.Count -eq 0) { throw "Unexpected Git config template else" }
            $frame = $frames.Peek()
            $active = $frame.Parent -and -not $frame.Taken
            $frame.Taken = $true
            continue
        }
        if ($line -match '^\s*{{/if}}\s*$') {
            if ($frames.Count -eq 0) { throw "Unexpected Git config template end" }
            $active = $frames.Pop().Parent
            continue
        }
        if ($active) { $rendered.Add($line) }
    }
    if ($frames.Count -ne 0) { throw "Unclosed Git config template block" }

    # Dotter used to fill these. Recover the existing identity from the most
    # recent preserved config, if present; otherwise leave identity unset.
    $identityBackup = Get-ChildItem -LiteralPath $HOME -Filter ".gitconfig.dotfiles-backup-*" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $userName = $null
    $userEmail = $null
    if ($identityBackup) {
        $savedConfig = [System.IO.File]::ReadAllText($identityBackup.FullName)
        # Keep matches line-bounded: Singleline/DotAll would consume later sections.
        $userSection = [regex]::Match($savedConfig, '(?im)^\[user\][ \t]*\r?\n(?<body>(?:[ \t][^\r\n]*(?:\r?\n|$))*)')
        if ($userSection.Success) {
            $nameMatch = [regex]::Match($userSection.Groups['body'].Value, '(?im)^\s*name\s*=\s*(.+?)\s*$')
            $emailMatch = [regex]::Match($userSection.Groups['body'].Value, '(?im)^\s*email\s*=\s*(.+?)\s*$')
            if ($nameMatch.Success) { $userName = $nameMatch.Groups[1].Value }
            if ($emailMatch.Success) { $userEmail = $emailMatch.Groups[1].Value }
        }
    }

    $content = $rendered -join [Environment]::NewLine
    if ($userName -and $userEmail) {
        $content = $content.Replace("{{name}}", [string]$userName).Replace("{{email}}", [string]$userEmail)
    } else {
        $content = [regex]::Replace($content, '(?m)^\[user\][ \t]*\r?\n(?:[ \t][^\r\n]*(?:\r?\n|$))*', '')
    }
    $content += [Environment]::NewLine
    Write-Generated (Join-Path $HOME ".gitconfig") $content
}

function Render-Starship {
    $source = Join-Path $RepoRoot "starship.toml"
    $content = [System.IO.File]::ReadAllText($source)
    $content = $content.Replace("{{hostname_color}}", "fg:#f7768e")
    Write-Generated (Join-Path $HOME ".config\starship.toml") $content
}

function Render-PowerShellProfiles {
    # Documents is redirected to OneDrive on managed machines, so the profile
    # path cannot be assumed to be $HOME\Documents. A copy would break the
    # repo profile's `$DotfilesRoot` ($PSScriptRoot-relative) lookup, and a
    # symlink inside OneDrive invites sync churn, so write a stub that
    # dot-sources the tracked profile instead.
    $documents = [Environment]::GetFolderPath("MyDocuments")
    if (-not $documents) { $documents = Join-Path $HOME "Documents" }

    $profiles = @(
        @{ Source = "powershell\7\profile.ps1"; Target = (Join-Path $documents "PowerShell\Microsoft.PowerShell_profile.ps1") },
        @{ Source = "powershell\5.1\profile.ps1"; Target = (Join-Path $documents "WindowsPowerShell\Microsoft.PowerShell_profile.ps1") }
    )

    foreach ($profile in $profiles) {
        $source = Join-Path $RepoRoot $profile.Source
        if (-not (Test-Path -LiteralPath $source)) {
            throw "Missing profile source: $source"
        }
        $content = "# Generated by dotfiles/scripts/deploy-windows.ps1 - do not edit.
# The tracked profile lives in the repository so it stays under version control.
. '$source'"
        Write-Generated $profile.Target $content
    }
}

function ConvertTo-Map {
    param($Value)

    # Windows PowerShell 5.1 has no ConvertFrom-Json -AsHashtable, so build
    # ordered dictionaries by hand to merge JSON trees generically.
    if ($null -eq $Value) { return $null }
    if ($Value -is [System.Management.Automation.PSCustomObject]) {
        $map = [ordered]@{}
        foreach ($property in $Value.PSObject.Properties) {
            $map[$property.Name] = ConvertTo-Map $property.Value
        }
        return $map
    }
    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        $list = New-Object System.Collections.Generic.List[object]
        foreach ($item in $Value) { $list.Add((ConvertTo-Map $item)) }
        return , $list
    }
    return $Value
}

function Merge-Map {
    param($Base, $Overlay)

    foreach ($key in $Overlay.Keys) {
        $value = $Overlay[$key]
        if ($value -is [System.Collections.IDictionary] -and $Base.Contains($key) -and $Base[$key] -is [System.Collections.IDictionary]) {
            Merge-Map $Base[$key] $value
        } else {
            $Base[$key] = $value
        }
    }
}

function Merge-ListItems {
    param($Base, $Overlay, [string]$Key)

    foreach ($item in $Overlay) {
        $match = $null
        foreach ($candidate in $Base) {
            if ($candidate.Contains($Key) -and $candidate[$Key] -eq $item[$Key]) { $match = $candidate; break }
        }
        if ($match) {
            Merge-Map $match $item
        } else {
            $Base.Add($item)
        }
    }
}

function Ensure-Map {
    param($Parent, [string]$Key)

    if (-not $Parent.Contains($Key) -or $Parent[$Key] -isnot [System.Collections.IDictionary]) {
        $Parent[$Key] = [ordered]@{}
    }
    return $Parent[$Key]
}

function Ensure-List {
    param($Parent, [string]$Key)

    if (-not $Parent.Contains($Key) -or $Parent[$Key] -isnot [System.Collections.IList]) {
        $Parent[$Key] = New-Object System.Collections.Generic.List[object]
    }
    return , $Parent[$Key]
}

function Render-WindowsTerminalSettings {
    param([string]$Target)

    # The repository owns appearance defaults, the TokyoNight palette, and the
    # portable profile entries it knows by GUID. Everything else in a live
    # settings.json (keybindings, additional profiles, terminal-generated
    # state) is preserved: deploying must never discard local edits.
    $fragmentPath = Join-Path $RepoRoot "windows-terminal\settings.json"
    $fragment = ConvertTo-Map (Get-Content -Raw -LiteralPath $fragmentPath | ConvertFrom-Json)

    $existing = [ordered]@{}
    if (Test-Path -LiteralPath $Target) {
        try {
            $existing = ConvertTo-Map (Get-Content -Raw -LiteralPath $Target | ConvertFrom-Json)
        } catch {
            Write-Host "  [WARN] $Target is not valid JSON; regenerating from the repository fragment" -ForegroundColor Yellow
            $existing = [ordered]@{}
        }
    }

    $fragmentProfiles = $fragment["profiles"]
    if ($fragmentProfiles) {
        $profiles = Ensure-Map $existing "profiles"
        if ($fragmentProfiles["defaults"]) {
            Merge-Map (Ensure-Map $profiles "defaults") $fragmentProfiles["defaults"]
        }
        if ($fragmentProfiles["list"]) {
            Merge-ListItems (Ensure-List $profiles "list") $fragmentProfiles["list"] "guid"
        }
    }
    if ($fragment["schemes"]) {
        Merge-ListItems (Ensure-List $existing "schemes") $fragment["schemes"] "name"
    }

    $content = ($existing | ConvertTo-Json -Depth 100) + [Environment]::NewLine
    Write-Generated $Target $content
}

function Render-ClinkStarship {
    # Starship reaches cmd.exe through Clink (Starship requires Clink >= 1.2.30).
    # Clink loads *.lua from its state directory, so the generated hook lives
    # there rather than in the repository; AutoRun is only created when the
    # user has none, so an existing hook is never overwritten.
    if (-not (Get-Command clink -ErrorAction SilentlyContinue)) {
        Write-Host "  [SKIP] clink not installed; cmd.exe keeps its default prompt"
        return
    }
    if (-not (Get-Command starship -ErrorAction SilentlyContinue)) {
        Write-Host "  [SKIP] starship not installed; cmd.exe keeps its default prompt"
        return
    }

    $target = Join-Path $env:LOCALAPPDATA "clink\starship.lua"
    $content = ((& starship init cmd) -join [Environment]::NewLine) + [Environment]::NewLine
    Write-Generated $target $content

    $autoRun = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Command Processor" -Name AutoRun -ErrorAction SilentlyContinue).AutoRun
    if (-not $autoRun) {
        & clink autorun install | Out-Null
        Write-Host "  [AUTORUN] clink autorun installed for cmd.exe"
    } else {
        Write-Host "  [OK] cmd.exe AutoRun already configured"
    }
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

# Store and unpackaged Windows Terminal builds use different settings paths.
$terminalPackagePath = Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json"
$terminalSettingsPath = Join-Path $env:LOCALAPPDATA "Microsoft\Windows Terminal\settings.json"
$terminalPackage = Get-AppxPackage -Name Microsoft.WindowsTerminal -ErrorAction SilentlyContinue
if ($terminalPackage -or (Test-Path -LiteralPath (Split-Path -Parent $terminalPackagePath))) {
    $terminalSettingsPath = $terminalPackagePath
}

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
    @{ Source = "gitignore_global"; Target = (Join-Path $HOME ".gitignore_global") },
    @{ Source = "config-windows\leopardwm\config.toml"; Target = (Join-Path $env:APPDATA "leopardwm\config\config.toml") },
    @{ Source = "config\zed\keymap.json"; Target = (Join-Path $env:LOCALAPPDATA "Zed\keymap.json") },

    @{ Source = "autohotkey\mac-layout.ahk"; Target = (Join-Path $HOME ".config\autohotkey\mac-layout.ahk") },
    @{ Source = "flow-launcher\README.md"; Target = (Join-Path $HOME ".config\flow-launcher\README.md") },
    @{ Source = "config\nvim"; Target = (Join-Path $HOME "AppData\Local\nvim") },
    @{ Source = "config\llama.cpp\start-server.ps1"; Target = (Join-Path $HOME ".config\llama.cpp\start-server.ps1") },
    @{ Source = "config\llama.cpp\README-windows.md"; Target = (Join-Path $HOME ".config\llama.cpp\README.md") },
    @{ Source = "config\bat"; Target = (Join-Path $HOME ".config\bat") },
    @{ Source = "config\btop"; Target = (Join-Path $HOME ".config\btop") },
    @{ Source = "config\eza"; Target = (Join-Path $HOME ".config\eza") },
    @{ Source = "config\nushell"; Target = (Join-Path $env:APPDATA "nushell") },
    @{ Source = "config\fastfetch"; Target = (Join-Path $HOME ".config\fastfetch") },
    # Shared non-secret env (single file, NOT the directory — the directory
    # holds decrypted secrets on Linux and must never be linked as a whole).
    @{ Source = "config\environment.d\10-dotfiles.conf"; Target = (Join-Path $HOME ".config\environment.d\10-dotfiles.conf") }
)

foreach ($link in $links) {
    Link-Config $link.Source $link.Target
}

Render-WindowsGitConfig
Render-Starship
Render-WindowsTerminalSettings $terminalSettingsPath
Render-ClinkStarship
Render-LlamaModels
Render-PowerShellProfiles

# Invoke helpers in the current PowerShell so this works from either Windows
# PowerShell 5.1 or PowerShell 7 without depending on powershell.exe lookup.
& (Join-Path $PSScriptRoot "sync-agent-state.ps1")
& (Join-Path $PSScriptRoot "deploy-secrets.ps1")

Write-Host "Windows configuration deployed successfully." -ForegroundColor Green
