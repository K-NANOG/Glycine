# Function to kill processes on specific ports
function Stop-ProcessOnPort {
    param($Port)
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($connection) {
            $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Stopping process on port $Port`: $($process.Name) (PID: $($process.Id))"
                Stop-Process -Id $process.Id -Force
            }
        }
    } catch {
        Write-Host "No process found on port $Port"
    }
}

# Function to test MongoDB connection
function Test-MongoDBConnection {
    try {
        $result = mongosh --eval "db.runCommand({ ping: 1 })" --quiet
        return $result -match "ok"
    } catch {
        return $false
    }
}

# Clear the screen
Clear-Host
Write-Host "Starting development environment..." -ForegroundColor Cyan

# Kill existing processes
Write-Host "`nStopping existing processes..." -ForegroundColor Yellow
Stop-ProcessOnPort 3000  # Frontend
Stop-ProcessOnPort 3001  # Frontend alternative port
Stop-ProcessOnPort 3002  # Backend

# Stop MongoDB if running
Write-Host "`nStopping MongoDB..." -ForegroundColor Yellow
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
    Write-Host "`nCreating MongoDB data directory..." -ForegroundColor Green
    New-Item -ItemType Directory -Path $mongoDataPath -Force
    Write-Host "Created MongoDB data directory at $mongoDataPath"
}

# Wait for ports to be released
Start-Sleep -Seconds 2

# Start MongoDB
$mongodPath = "C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe"
$mongodArgs = "--dbpath=`"$mongoDataPath`" --port 27017"
Write-Host "`nStarting MongoDB server..." -ForegroundColor Green
$mongod = Start-Process -FilePath $mongodPath -ArgumentList $mongodArgs -PassThru -WindowStyle Normal

# Wait for MongoDB to start
Write-Host "Waiting for MongoDB to start..." -ForegroundColor Yellow
$mongoTimeout = 30
$mongoTimer = 0
while ($mongoTimer -lt $mongoTimeout) {
    if (Test-MongoDBConnection) {
        Write-Host "MongoDB is running!" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $mongoTimer++
    Write-Host "." -NoNewline
}

if ($mongoTimer -eq $mongoTimeout) {
    Write-Host "Error: MongoDB failed to start" -ForegroundColor Red
    exit 1
}

# Start MongoDB shell in a new window
Write-Host "`nStarting MongoDB shell..." -ForegroundColor Green
$mongoShell = Start-Process powershell -ArgumentList "-NoExit", "-Command", "mongosh" -WindowStyle Normal

# Start the backend server
Write-Host "`nStarting backend server..." -ForegroundColor Green
$backendWindow = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev" -WindowStyle Normal

# Wait for backend to initialize
Write-Host "Waiting for backend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Start the frontend server
Write-Host "`nStarting frontend server..." -ForegroundColor Green
$frontendWindow = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot/frontend'; npm run dev" -WindowStyle Normal

# Final status message
Write-Host "`nDevelopment environment is ready!" -ForegroundColor Green
Write-Host "MongoDB: mongodb://localhost:27017"
Write-Host "Backend: http://localhost:3002"
Write-Host "Frontend: http://localhost:3000"
Write-Host "`nPress Ctrl+C to stop all processes`n"

# Keep the script running and handle cleanup on exit
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nStopping all processes..." -ForegroundColor Yellow
    if ($mongod) { Stop-Process -Id $mongod.Id -Force }
    if ($mongoShell) { Stop-Process -Id $mongoShell.Id -Force }
    if ($backendWindow) { Stop-Process -Id $backendWindow.Id -Force }
    if ($frontendWindow) { Stop-Process -Id $frontendWindow.Id -Force }
    Write-Host "All processes stopped" -ForegroundColor Green
} 