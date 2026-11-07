#Requires -Version 5.1
# Junction regression tests use only disposable fixtures, never the real home.
$ErrorActionPreference = "Stop"
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    Write-Output "Windows junction tests skipped on non-Windows host"
    exit 0
}
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $repo "scripts/deploy-windows.ps1"), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "Deployment script does not parse" }
foreach ($name in @('Get-ExistingItem', 'Get-FileDigest', 'Remove-Or-Backup', 'Link-Config')) {
    $definition = $ast.Find({ param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
}
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ("windows-links-" + [Guid]::NewGuid().ToString("N"))
$RepoRoot = Join-Path $fixture 'repo'
$source = Join-Path $RepoRoot 'config'
$target = Join-Path $fixture 'deployed'
New-Item -ItemType Directory -Path $source -Force | Out-Null
[System.IO.File]::WriteAllText((Join-Path $source 'sentinel.txt'), 'preserve me')
try {
    New-Item -ItemType Junction -Path $target -Target $source | Out-Null
    # A correct junction must be a no-op, not removed/recreated.
    function Remove-Or-Backup { param([string]$Path) throw "Correct junction was unexpectedly removed" }
    Link-Config 'config' $target
    $definition = $ast.Find({ param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Remove-Or-Backup'
    }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
    Remove-Or-Backup $target
    if (Test-Path -LiteralPath $target) { throw 'Junction was not removed' }
    if ([System.IO.File]::ReadAllText((Join-Path $source 'sentinel.txt')) -ne 'preserve me') {
        throw 'Junction removal changed its source'
    }
    Write-Output 'Windows junction idempotence and safe-removal tests passed'
} finally {
    if (Test-Path -LiteralPath $target) { [System.IO.Directory]::Delete($target) }
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
