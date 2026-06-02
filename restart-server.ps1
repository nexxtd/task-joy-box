# Restart the server
Write-Host "Restarting the server..."

# Kill any existing node processes
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Start the server
Write-Host "Starting server..."
Start-Process -FilePath "cmd" -ArgumentList "/k", "npm run dev:server" -WindowStyle Normal

Write-Host "Server restart initiated. The support tables will be created on startup."
Read-Host "Press Enter to exit"