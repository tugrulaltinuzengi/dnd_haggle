# Builds the Android shell. The server address is embedded as the default (players can still change it in the app).
#   powershell -ExecutionPolicy Bypass -File esp\tools\build-apk.ps1 -Url https://pazar-relay.<you>.workers.dev
param([string]$Url = '')
$ErrorActionPreference = 'Stop'
$android = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'android'
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$gradle = Get-ChildItem "$HOME\.gradle\wrapper\dists\gradle-8.10.2-bin" -Recurse -Filter gradle.bat | Select-Object -First 1
if (-not $gradle) { throw 'Gradle 8.10.2 not found under ~/.gradle/wrapper/dists' }
Push-Location $android
try {
  $args = @('assembleDebug')
  if ($Url) { $args += "-PpazarUrl=$Url" }
  & $gradle.FullName @args
  if ($LASTEXITCODE -ne 0) { throw "gradle failed ($LASTEXITCODE)" }
  Get-Item app\build\outputs\apk\debug\app-debug.apk | Select-Object FullName, Length
} finally { Pop-Location }
