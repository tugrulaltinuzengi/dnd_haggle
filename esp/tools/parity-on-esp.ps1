# Joins the ESP's "Pazar" AP, runs the HTTP parity suite against it, then restores the previous Wi-Fi.
# Run from a normal PowerShell:  powershell -ExecutionPolicy Bypass -File esp\tools\parity-on-esp.ps1
# While the PC is on Pazar there is no internet (the ESP is an isolated AP). Output goes to esp\parity-result.txt.
$ErrorActionPreference = 'Stop'
$esp = Split-Path -Parent $PSScriptRoot
$app = Join-Path (Split-Path -Parent $esp) 'app'
$out = Join-Path $esp 'parity-result.txt'
$cfg = @{}
Get-Content (Join-Path $esp 'secrets.ini') | ForEach-Object { if ($_ -match '^\s*(\w+)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2] } }
$ssid = 'Pazar'
$prev = ((netsh wlan show interfaces) | Select-String '^\s*SSID\s*:\s*(.+)$' | Select-Object -First 1).Matches.Groups[1].Value.Trim()
Write-Host "previous Wi-Fi: '$prev'"

$xml = @"
<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>$ssid</name>
  <SSIDConfig><SSID><name>$ssid</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM><security>
    <authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
    <sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>$($cfg['AP_PASS'])</keyMaterial></sharedKey>
  </security></MSM>
</WLANProfile>
"@
$tmp = Join-Path $env:TEMP 'pazar-wlan.xml'
try {
  Set-Content -Path $tmp -Value $xml -Encoding UTF8
  netsh wlan add profile filename="$tmp" | Out-Null
  Remove-Item $tmp -Force
  netsh wlan connect name=$ssid | Out-Null

  $up = $false
  for ($i = 0; $i -lt 30 -and -not $up; $i++) {
    Start-Sleep 1
    try { $r = Invoke-RestMethod -Uri 'http://192.168.4.1/api/ping' -TimeoutSec 2; $up = $true; Write-Host "ping ok: $($r | ConvertTo-Json -Compress)" } catch { }
  }
  if (-not $up) { throw "ESP not reachable at 192.168.4.1 after 30 s (check netsh wlan show interfaces)" }

  Push-Location $app
  $env:BASE = 'http://192.168.4.1'; $env:DM_PIN = $cfg['DM_PIN']; $env:PIN_LOCK_MS = '1500'
  $env:NO_COLOR = '1'
  node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=$out test/http/parity.test.js
  Pop-Location
}
finally {
  netsh wlan delete profile name=$ssid | Out-Null
  if ($prev) { netsh wlan connect name="$prev" | Out-Null; Write-Host "restored Wi-Fi: $prev" }
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
}
