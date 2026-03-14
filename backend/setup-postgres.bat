@echo off
REM Complete PostgreSQL Setup for Grocer-E
REM Run this as Administrator

echo ===========================================
echo Complete PostgreSQL Setup for Grocer-E
echo ===========================================
echo.

echo This script will:
echo 1. Start PostgreSQL service
echo 2. Create/configure postgres user
echo 3. Create grocere_db database
echo 4. Test the connection
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo ✅ Running as Administrator
) else (
    echo ❌ Please run this script as Administrator!
    echo Right-click the script and select "Run as administrator"
    pause
    exit /b 1
)

echo.
echo Step 1: Starting PostgreSQL service...
net start postgresql-x64-18
if %errorlevel% neq 0 (
    echo ❌ Failed to start PostgreSQL service
    echo Please check if PostgreSQL 18 is installed correctly
    pause
    exit /b 1
)
echo ✅ PostgreSQL service started

echo.
echo Step 2: Adding PostgreSQL to PATH...
set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
set "PATH=%PATH%;%PG_BIN%"

echo.
echo Step 3: Creating postgres user...
REM Try to create user (may fail if exists, that's ok)
psql -U postgres -c "CREATE USER postgres WITH PASSWORD 'sPec!aloN1on';" 2>nul
psql -U postgres -c "ALTER USER postgres PASSWORD 'sPec!aloN1on';" 2>nul
psql -U postgres -c "ALTER USER postgres CREATEDB;" 2>nul

REM If that didn't work, try connecting as current user to create postgres
if %errorlevel% neq 0 (
    echo Trying alternative method...
    REM Get current username
    for /f "tokens=*" %%i in ('whoami') do set WINUSER=%%i
    for /f "tokens=2 delims=\" %%i in ("%WINUSER%") do set WINUSER=%%i

    echo Attempting to connect as %WINUSER%...
    psql -U "%WINUSER%" -c "CREATE USER IF NOT EXISTS postgres WITH PASSWORD 'sPec!aloN1on';" 2>nul
    psql -U "%WINUSER%" -c "ALTER USER postgres CREATEDB;" 2>nul
)

echo.
echo Step 4: Creating database...
psql -U postgres -c "DROP DATABASE IF EXISTS grocere_db;" 2>nul
psql -U postgres -c "CREATE DATABASE grocere_db;" 2>nul
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE grocere_db TO postgres;" 2>nul

echo.
echo Step 5: Testing connection...
psql -U postgres -d grocere_db -c "SELECT version();" >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ Database setup successful!
    echo.
    echo Your .env file should contain:
    echo DB_HOST=localhost
    echo DB_USER=postgres
    echo DB_PASSWORD=sPec!aloN1on
    echo.
    echo You can now run: npm run dev
    echo.
    goto success
) else (
    echo ❌ Database setup failed
    echo.
    echo Troubleshooting:
    echo 1. Make sure PostgreSQL 18 is installed
    echo 2. Check Windows Services for postgresql-x64-18
    echo 3. Try running psql manually: psql -U postgres -d grocere_db
    echo.
    goto failure
)

:success
echo.
echo Setup completed successfully! 🎉
echo.
echo Next steps:
echo 1. Update your .env file: DB_HOST=localhost
echo 2. Run: npm run dev
echo.
pause
exit /b 0

:failure
echo Setup failed. Please check the troubleshooting steps above.
pause
exit /b 1