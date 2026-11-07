#Requires -Version 5.1
# Exercise only the renderer, never the deployment's machine-changing entrypoint.
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $RepoRoot "scripts/deploy-windows.ps1"), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "Deployment script does not parse" }
$renderer = $ast.Find({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq "Render-WindowsGitConfig"
}, $true)
. ([scriptblock]::Create($renderer.Extent.Text))

function Write-Generated {
    param([string]$Target, [string]$Content)
    $script:RenderedConfig = $Content
}

$originalHome = $HOME
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ("windows-gitconfig-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $fixture | Out-Null
try {
    Set-Variable -Name HOME -Value $fixture -Force
    foreach ($newline in @("`n", "`r`n")) {
        foreach ($withIdentity in @($false, $true)) {
            $backup = Join-Path $fixture ".gitconfig.dotfiles-backup-test"
            if ($withIdentity) {
                $saved = @('[user]', "`tname = Test User", "`temail = test@example.invalid", '[alias]', "`tname = NOT THE USER") -join $newline
                [System.IO.File]::WriteAllText($backup, $saved)
            } elseif (Test-Path -LiteralPath $backup) {
                Remove-Item -LiteralPath $backup
            }
            Render-WindowsGitConfig
            $output = Join-Path $fixture "rendered.gitconfig"
            [System.IO.File]::WriteAllText($output, $script:RenderedConfig)
            $helper = & git config --file $output --get credential.helper
            if ($LASTEXITCODE -ne 0 -or $helper -ne 'manager') { throw "Windows credential helper missing" }
            $alias = & git config --file $output --get alias.last
            if ($LASTEXITCODE -ne 0 -or $alias -ne 'log -1 HEAD --stat') { throw "Aliases lost during rendering" }
            if ($script:RenderedConfig -match '{{|osxkeychain|helper = cache') { throw "Unrendered/non-Windows branch" }
            $name = & git config --file $output --get user.name
            if ($withIdentity) {
                if ($LASTEXITCODE -ne 0 -or $name -ne 'Test User') { throw "Saved identity not preserved" }
                $email = & git config --file $output --get user.email
                if ($email -ne 'test@example.invalid') { throw "Saved email not preserved" }
            } elseif ($LASTEXITCODE -ne 1) {
                throw "Identity should remain unset without a backup"
            }
        }
    }
    Write-Output "Windows Git config rendering tests passed"
} finally {
    Set-Variable -Name HOME -Value $originalHome -Force
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
