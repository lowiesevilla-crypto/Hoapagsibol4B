$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$node = "C:\Users\lowie\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$tailscale = "C:\Program Files\Tailscale\tailscale.exe"

if (-not (Test-Path $docker)) { throw "Docker Desktop is not installed." }
if (-not (Test-Path $node)) { throw "The bundled Node.js runtime is missing." }
if (-not (Test-Path $tailscale)) { throw "Tailscale is not installed." }
if (-not (Test-Path (Join-Path $root ".next\BUILD_ID"))) { throw "The production build is missing. Run pnpm build first." }

function Test-DockerReady {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    & $docker info *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

if (-not (Test-DockerReady)) {
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  $ready = $false
  for ($attempt = 0; $attempt -lt 36; $attempt++) {
    Start-Sleep -Seconds 5
    if (Test-DockerReady) { $ready = $true; break }
  }
  if (-not $ready) { throw "Docker Desktop did not become ready within three minutes." }
}

& $docker compose --file (Join-Path $root "docker-compose.yml") up -d
if ($LASTEXITCODE -ne 0) { throw "MySQL did not start." }

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  $website = [System.Diagnostics.ProcessStartInfo]::new()
  $website.FileName = $node
  $website.Arguments = "node_modules\next\dist\bin\next start -p 3000"
  $website.WorkingDirectory = $root
  $website.UseShellExecute = $true
  $website.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  [System.Diagnostics.Process]::Start($website) | Out-Null
}

$healthy = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://localhost:3000/login" -TimeoutSec 5
    if ($response.StatusCode -eq 200) { $healthy = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}
if (-not $healthy) { throw "The HOA website did not become healthy." }

$tailscaleService = Get-Service Tailscale -ErrorAction Stop
if ($tailscaleService.Status -ne "Running") { Start-Service Tailscale }
$tailscaleStatus = & $tailscale status --json | ConvertFrom-Json
if ($tailscaleStatus.BackendState -ne "Running" -or -not $tailscaleStatus.Self.Online) {
  throw "Tailscale is not signed in. Open Tailscale and sign in before starting public access."
}

& $tailscale funnel --bg --yes 3000
if ($LASTEXITCODE -ne 0) { throw "Tailscale Funnel did not start." }
$hostname = $tailscaleStatus.Self.DNSName.TrimEnd(".")

Write-Host ""
Write-Host "Pagsibol HOA portal is running." -ForegroundColor Green
Write-Host "Local:     http://localhost:3000/login"
Write-Host "Permanent: https://$hostname/login" -ForegroundColor Cyan
Write-Host ""
Write-Host "Keep this computer and Docker Desktop running for homeowners to access the portal."
