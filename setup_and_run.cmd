@echo off
setlocal
cd /d "%~dp0"
title Clone Hero OBS Scene Switcher

echo ============================================================
echo Clone Hero OBS Scene Switcher - OBS WebSocket 5.x
echo ============================================================
echo.

if not exist "settings.ini" (
    echo ERROR: settings.ini is missing.
    echo Keep settings.ini in the same folder as setup_and_run.cmd.
    echo.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or is not on PATH.
    echo.
    echo Install the current Node.js LTS Windows x64 installer from:
    echo https://nodejs.org/en/download
    echo.
    echo Close and reopen this window after installation, then run this file again.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found.
    echo Reinstall Node.js LTS and make sure npm and Add to PATH are enabled.
    echo.
    pause
    exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 (
    echo ERROR: Node.js 18 or newer is required.
    echo Install the current Node.js LTS release from https://nodejs.org/en/download
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\obs-websocket-js\package.json" (
    echo Installing the required OBS WebSocket package...
    echo This only happens on the first run and requires an internet connection.
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed.
        echo Check the internet connection, then run setup_and_run.cmd again.
        echo If the folder is inside Program Files, move it to Documents or C:\Tools.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Starting scene switcher...
echo Keep this window open while streaming.
echo.
node index.js

echo.
echo Scene switcher stopped.
echo Review any error shown above and see README.txt for troubleshooting.
pause
