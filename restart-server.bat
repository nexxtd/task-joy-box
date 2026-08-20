@echo off
echo Restarting the server...

REM Kill any existing node processes
taskkill /F /IM node.exe 2>nul

REM Start the server
echo Starting server...
start "Server" cmd /k "npm run dev:server"

echo Server restart initiated. The support tables will be created on startup.
pause