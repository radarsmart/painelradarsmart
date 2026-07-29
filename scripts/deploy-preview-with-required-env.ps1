$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\.env.local"
if (-not (Test-Path $envFile)) {
  throw ".env.local nao encontrado em $envFile"
}

$wanted = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ELEVENLABS_DEFAULT_VOICE_ID"
)

$pairs = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)=(.*)\s*$') {
    $pairs[$matches[1]] = $matches[2]
  }
}

$args = @("deploy", "--yes", "--target=preview")
foreach ($name in $wanted) {
  $value = $pairs[$name]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Valor ausente para $name no .env.local"
  }

  $args += @("-b", "$name=$value")
  $args += @("-e", "$name=$value")
}

& "C:\Users\User\AppData\Roaming\npm\vercel.cmd" @args
