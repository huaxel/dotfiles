@echo off
setlocal
cd /d "%~dp0"

rem Dotter copies hook scripts to .dotter/cache/.dotter/ before running them.
rem Navigate up two levels to reach the real .dotter/ directory.
set "REAL_DIR=%~dp0..\.."

where powershell >nul 2>nul
if %ERRORLEVEL% equ 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%REAL_DIR%\pre_deploy.ps1"
    exit /b %ERRORLEVEL%
)

where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%REAL_DIR%\pre_deploy.bash"
    exit /b %ERRORLEVEL%
)

echo Warning: neither PowerShell nor bash found in PATH; skipping pre-deploy hook >&2
exit /b 0
