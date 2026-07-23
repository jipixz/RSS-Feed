# Reinicia el servidor Kokoro TTS en modo headless (sin ventana).
# Uso:  powershell -ExecutionPolicy Bypass -File tools\kokoro-restart.ps1
# Logs: %LOCALAPPDATA%\kokoro-server.log (+ .err)

$port = 8880

# 1) matar lo que esté escuchando en el puerto (si hay algo)
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    try { Stop-Process -Id $_ -Force -ErrorAction Stop; Write-Host "Detenido PID $_" } catch {}
  }
  Start-Sleep -Milliseconds 500
}

# 2) relanzar oculto, con GPU y logs a archivo
$env:KOKORO_DEVICE = 'cuda'
$script = Join-Path $PSScriptRoot 'kokoro-server.py'
$log = Join-Path $env:LOCALAPPDATA 'kokoro-server.log'
Start-Process python -ArgumentList "`"$script`"" -WindowStyle Hidden `
  -RedirectStandardOutput $log -RedirectStandardError "$log.err"

# 3) esperar a que responda /health (el arranque en frío de Python puede tardar)
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  try {
    $h = Invoke-RestMethod "http://localhost:$port/health" -TimeoutSec 2
    Write-Host "Kokoro arriba (headless): $($h | ConvertTo-Json -Compress) · logs: $log"
    exit 0
  } catch {}
}
Write-Warning "No respondio /health en 45s - revisa $log.err"
exit 1
