@echo off
echo Starting Task Joy Box with Cloudflare Tunnel...

echo Installing dependencies if needed...
npm install

REM Start the backend server in a separate window
start "Backend Server" cmd /k "cd /d "%~dp0" && cd server && npx nodemon index.ts"

REM Wait a bit for the server to start
timeout /t 5 /nobreak >nul

REM Start the frontend server
start "Frontend Server" cmd /k "cd /d "%~dp0" && npx vite"

REM Wait for frontend to start
timeout /t 10 /nobreak >nul

REM Start the Cloudflare tunnel
echo When ready, run this command in a new terminal:
echo npx wrangler tunnel quick-start http://localhost:3001
pause