@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0pre_deploy.ps1" (
  powershell.exe -ExecutionPolicy Bypass -File "%~dp0pre_deploy.ps1"
) else (
  powershell.exe -ExecutionPolicy Bypass -File "%~dp0..\..\pre_deploy.ps1"
)
exit /b %ERRORLEVEL%
