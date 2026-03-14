@echo off
REM Quick start script for Grocer-E development with Docker on Windows

echo =========================================
echo Grocer-E Docker Startup Script
echo =========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [X] Docker is not running. Please start Docker and try again.
    exit /b 1
)

echo [OK] Docker is running
echo.

REM Check if docker-compose is available
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [X] docker-compose is not available. Please ensure Docker Desktop is installed with Compose.
    exit /b 1
)

echo [OK] docker-compose is available
echo.

REM Build and start services
echo [*] Building and starting services...
echo.

docker-compose up --build

echo.
echo =========================================
echo [OK] Services started successfully!
echo =========================================
echo.
echo Access the application:
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:5000
echo   Database:  localhost:5432
echo.
echo To stop services, press Ctrl+C or run: docker-compose down
echo =========================================
pause
