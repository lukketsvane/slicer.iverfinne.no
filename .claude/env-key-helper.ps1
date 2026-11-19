$ErrorActionPreference = 'Stop'
$path = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
$line = Get-Content -LiteralPath $path | Where-Object { $_ -match '^\s*ANTHROPIC_API_KEY\s*=' } | Select-Object -Last 1
if (-not $line) { throw 'ANTHROPIC_API_KEY missing from .env' }
$key = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
if (-not $key) { throw 'ANTHROPIC_API_KEY is empty in .env' }
[Console]::Out.Write($key)
