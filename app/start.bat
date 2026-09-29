@echo off
rem Sunucuyu baslatir. Kullanim: set DM_PIN=xxxx ^& start.bat
cd /d "%~dp0"
if "%DM_PIN%"=="" (
  echo DM_PIN ayarla: set DM_PIN=xxxx
  exit /b 1
)
node server.js
