@echo off
setlocal
cd /d "%~dp0"

powershell.exe -ExecutionPolicy Bypass -File "%~dp0pre_deploy.ps1"
exit /b %ERRORLEVEL%
