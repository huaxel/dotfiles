@echo off
setlocal
cd /d "%~dp0"

where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%~dp0pre_deploy.sh"
    exit /b %ERRORLEVEL%
)

echo Error: bash not found in PATH >&2
exit /b 1
