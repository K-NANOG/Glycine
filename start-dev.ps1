# Function to check if a port is in use
function Test-PortInUse {
    param($port)
    
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

# Function to stop a process using a specific port
function Stop-ProcessOnPort {
    param($port)
    
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connection) {
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Stopping process on port $port (PID: $($process.Id))"
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
    }
}

# Stop any processes using our ports
Stop-ProcessOnPort 3001
Stop-ProcessOnPort 3002

# Stop MongoDB if it's running
$mongoProcess = Get-Process mongod -ErrorAction SilentlyContinue
if ($mongoProcess) {
    Write-Host "Stopping MongoDB (PID: $($mongoProcess.Id))"
    Stop-Process -Id $mongoProcess.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Clean MongoDB data directory
Write-Host "Cleaning MongoDB data directory..."
if (Test-Path "C:\data\db") {
    Remove-Item -Path "C:\data\db\*" -Recurse -Force -ErrorAction SilentlyContinue
}

# Create MongoDB data directory if it doesn't exist
if (-not (Test-Path "C:\data\db")) {
    New-Item -ItemType Directory -Path "C:\data\db" -Force
}

# Start MongoDB in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "mongod --dbpath C:\data\db"

# Wait for MongoDB to start
Start-Sleep -Seconds 5

# Start backend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"

# Start frontend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "All services started! Access the application at:"
Write-Host "Frontend: http://localhost:3001"
Write-Host "Backend: http://localhost:3002"

# Keep the script running
Write-Host "Press Ctrl+C to stop all services..."
while ($true) {
    Start-Sleep -Seconds 1
} 