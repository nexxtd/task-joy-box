# PowerShell script to start TaskJoy Box with Cloudflare Tunnel

Write-Host "Starting TaskJoy Box with Cloudflare Tunnel..." -ForegroundColor Green

# Function to check if a port is in use
function Test-Port {
    param([int]$port)
    
    $tcpConnection = New-Object System.Net.Sockets.TcpClient
    $connect = $tcpConnection.BeginConnect("127.0.0.1", $port, $null, $null)
    $wait = $connect.AsyncWaitHandle.WaitOne(1000, $false)
    
    if (!$wait) {
        $tcpConnection.Close()
        return $false
    } else {
        try {
            $tcpConnection.EndConnect($connect)
            $tcpConnection.Close()
            return $true
        } catch {
            $tcpConnection.Close()
            return $false
        }
    }
}

# Check if backend port is available
if (Test-Port -port 3001) {
    Write-Host "Port 3001 is already in use. Please close any existing processes." -ForegroundColor Red
    Read-Host "Press Enter to continue after closing the processes"
}

# Check if frontend port is available
if (Test-Port -port 5173) {
    Write-Host "Port 5173 is already in use. Please close any existing processes." -ForegroundColor Red
    Read-Host "Press Enter to continue after closing the processes"
}

# Start backend server in a new PowerShell window
Write-Host "Starting backend server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-Command", "Set-Location '$PWD'; cd server; node index.ts"

# Wait for backend to start
Start-Sleep -Seconds 5

# Start frontend server in a new PowerShell window
Write-Host "Starting frontend server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-Command", "Set-Location '$PWD'; npx vite"

# Instructions for the user
Write-Host "`nApplication started successfully!" -ForegroundColor Green
Write-Host "1. Backend: http://localhost:3001" -ForegroundColor Cyan
Write-Host "2. Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start Cloudflare tunnel:" -ForegroundColor Yellow
Write-Host "Open a new terminal and run: npx wrangler tunnel --url http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "After starting the tunnel:" -ForegroundColor Yellow
Write-Host "1. Copy the tunnel URL" -ForegroundColor White
Write-Host "2. Add it to ADDITIONAL_ALLOWED_ORIGINS in your .env file" -ForegroundColor White
Write-Host "3. Restart the backend server" -ForegroundColor White