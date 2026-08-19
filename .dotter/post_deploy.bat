@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0post_deploy.ps1" (
  powershell.exe -ExecutionPolicy Bypass -File "%~dp0post_deploy.ps1"
) else (
  powershell.exe -ExecutionPolicy Bypass -File "%~dp0..\..\post_deploy.ps1"
)
exit /b %ERRORLEVEL%
