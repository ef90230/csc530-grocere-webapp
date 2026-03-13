@echo off
REM Add PostgreSQL to PATH and test connection

echo Adding PostgreSQL 18 to PATH...
set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
set "PATH=%PATH%;%PG_BIN%"

echo.
echo Testing PATH addition...
where psql
if %errorlevel% neq 0 (
    echo ❌ Failed to add PostgreSQL to PATH
    echo Please check if PostgreSQL 18 is installed correctly
    pause
    exit /b 1
)

echo ✅ PostgreSQL added to PATH successfully
echo.
echo Testing basic connection...
psql --version
if %errorlevel% neq 0 (
    echo ❌ Cannot run psql
    pause
    exit /b 1
)

echo.
echo Now you can run the setup script:
echo setup-db.bat
echo.
echo Or run the diagnostic:
echo diagnose-db.bat
echo.
pause