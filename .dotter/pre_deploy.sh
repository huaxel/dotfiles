#!/usr/bin/env bash
# 2>nul || @echo off & goto :windows & rem
#
# Pre-deploy hook delegator — bash (Unix/macOS) / batch (Windows) polyglot
# Dotter copies hook scripts to .dotter/cache/.dotter/ before running them.
# On Unix/macOS, bash runs this via the shebang.
# On Windows, cmd.exe interprets it; the "#" line above triggers || and jumps
# to the :windows section which runs pre_deploy.bash via bash if available.
#
DOTTER_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
exec "$DOTTER_DIR/pre_deploy.bash"

:windows
@echo off
setlocal
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File "%~dp0..\..\pre_deploy.ps1"
exit /b %ERRORLEVEL%
