# Kill any existing processes on ports 3001 and 3002
try {
    $connections = Get-NetTCPConnection -LocalPort 3001,3002 -ErrorAction SilentlyContinue
    if ($connections) {
        $connections | ForEach-Object {
            $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Stopping process on port $($_.LocalPort): $($process.Name) (PID: $($process.Id))"
                Stop-Process -Id $process.Id -Force
            }
        }
    }
} catch {
    Write-Host "No existing processes to kill"
}

# Kill any existing MongoDB processes
try {
    Get-Process mongod -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "Stopping MongoDB process (PID: $($_.Id))"
        Stop-Process -Id $_.Id -Force
    }
} catch {
    Write-Host "No MongoDB processes to kill"
}

# Create MongoDB data directory if it doesn't exist
$mongoDataPath = "C:\data\db"
if (-not (Test-Path $mongoDataPath)) {
    New-Item -ItemType Directory -Path $mongoDataPath -Force
}

# Wait for ports to be released
Start-Sleep -Seconds 2

# Ensure MongoDB is running with correct arguments
$mongodPath = "C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe"
$mongodArgs = "--dbpath=`"$mongoDataPath`""
$mongod = Start-Process -FilePath $mongodPath -ArgumentList $mongodArgs -PassThru -WindowStyle Hidden

# Wait for MongoDB to start
Write-Host "Waiting for MongoDB to start..."
Start-Sleep -Seconds 5

# Start the backend server in a new window
$env:NODE_ENV = "development"
$env:PORT = "3002"
Write-Host "Starting backend server..."
$backendWindow = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev" -PassThru

# Wait for backend to initialize
Write-Host "Waiting for backend to initialize..."
Start-Sleep -Seconds 5

# Start the frontend server
$env:PORT = "3001"
Write-Host "Starting frontend server..."
$frontendWindow = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot/frontend'; `$env:PORT='3001'; npm run dev" -PassThru

Write-Host "Started all services:"
Write-Host "MongoDB running at: mongodb://localhost:27017"
Write-Host "Backend running at: http://localhost:3002"
Write-Host "Frontend running at: http://localhost:3001"

# Function to check if a port is responding
function Test-Port {
    param($Port)
    try {
        $tcp = New-Object Net.Sockets.TcpClient
        $tcp.Connect("localhost", $Port)
        $tcp.Close()
        return $true
    } catch {
        return $false
    }
}

# Wait for servers to be ready
$timeout = 30
$timer = 0
while ($timer -lt $timeout) {
    if ((Test-Port 3001) -and (Test-Port 3002)) {
        Write-Host "Both servers are responding!"
        break
    }
    Start-Sleep -Seconds 1
    $timer++
    Write-Host "Waiting for servers to initialize... ($timer/$timeout)"
}

if ($timer -eq $timeout) {
    Write-Host "Warning: Timeout waiting for servers to respond. Please check the server windows for errors."
} 