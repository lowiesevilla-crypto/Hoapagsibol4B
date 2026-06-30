$tailscale = "C:\Program Files\Tailscale\tailscale.exe"

if (-not (Test-Path $tailscale)) {
  throw "Tailscale is not installed."
}

& $tailscale funnel reset
if ($LASTEXITCODE -ne 0) { throw "Tailscale Funnel could not be stopped." }

Write-Host "Permanent public access has been stopped." -ForegroundColor Yellow
Write-Host "The local website and database were left running."
