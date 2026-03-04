# HeatGuard AI - Local Development Startup Script (Windows)
# This script starts the backend server in local development mode

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HeatGuard AI - Local Mode Starting" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env.local exists
if (Test-Path ".env.local") {
    Write-Host "Using environment from .env.local" -ForegroundColor Green
} else {
    Write-Host "Warning: .env.local not found!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Backend URL: http://localhost:8000" -ForegroundColor Yellow
Write-Host "Frontend URL: http://localhost:3000" -ForegroundColor Yellow
Write-Host "API Docs:    http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host ""
Write-Host "Starting backend server..." -ForegroundColor Cyan
Write-Host ""

# Change to backend directory and start uvicorn
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
