@echo off
setlocal
cd /d "%~dp0"

powershell.exe -ExecutionPolicy Bypass -File "%~dp0post_deploy.ps1"
exit /b %ERRORLEVEL%
