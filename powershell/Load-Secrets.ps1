function Import-DotfilesSecrets {
    param(
        [string]$Path = (Join-Path $HOME ".config\secrets\env.fish")
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith('#')) {
            continue
        }

        if ($trimmed -notmatch '^set\s+(?:-[A-Za-z]+\s+)*([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)\s*$') {
            continue
        }

        $name = $matches[1]
        $value = $matches[2].Trim()

        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        } elseif ($value.Length -ge 2 -and $value.StartsWith("'") -and $value.EndsWith("'")) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        Set-Item -Path "Env:$name" -Value $value
    }

    Sync-OpenferenceAuth -ApiKey $env:OPENFERENCE_API_KEY
}

function Sync-OpenferenceAuth {
    param(
        [string]$ApiKey
    )

    if ([string]::IsNullOrWhiteSpace($ApiKey)) {
        return
    }

    $paths = @(
        (Join-Path $HOME ".pi\agent\auth.json")
    )
    if ($env:PI_CODING_AGENT_DIR) {
        $paths += (Join-Path $env:PI_CODING_AGENT_DIR "auth.json")
    }

    foreach ($path in ($paths | Select-Object -Unique)) {
        $dir = Split-Path -Parent $path
        if ($dir) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }

        $data = @{}
        if (Test-Path -LiteralPath $path) {
            try {
                $json = [System.IO.File]::ReadAllText($path) | ConvertFrom-Json
                foreach ($prop in $json.PSObject.Properties) {
                    $data[$prop.Name] = $prop.Value
                }
            } catch {
                $data = @{}
            }
        }

        $data["openference"] = @{ type = "api_key"; key = $ApiKey }
        $data | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $path -Encoding utf8
    }
}
