#!/bin/bash

# HeatGuard AI - Local Development Startup Script (Mac/Linux)
# This script starts the backend server in local development mode

echo "========================================"
echo "  HeatGuard AI - Local Mode Starting"
echo "========================================"
echo ""

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "Using environment from .env.local"
else
    echo "Warning: .env.local not found!"
fi

echo ""
echo "Backend URL: http://localhost:8000"
echo "Frontend URL: http://localhost:3000"
echo "API Docs:    http://localhost:8000/docs"
echo ""
echo "Starting backend server..."
echo ""

# Change to backend directory and start uvicorn
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
