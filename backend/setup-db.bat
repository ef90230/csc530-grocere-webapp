@echo off
REM Grocer-E Database Setup Script for Windows
REM This script helps set up PostgreSQL for the Grocer-E application

echo Grocer-E Database Setup
echo ========================

echo.
echo Adding PostgreSQL 18 to PATH...
set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
set "PATH=%PATH%;%PG_BIN%"

REM Check if PostgreSQL is installed
where psql >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ PostgreSQL is not installed or not in PATH.
    echo.
    echo Please ensure PostgreSQL is installed and added to PATH.
    echo Common installation paths:
    echo - C:\Program Files\PostgreSQL\18\bin
    echo - C:\Program Files\PostgreSQL\17\bin
    echo - C:\Program Files\PostgreSQL\16\bin
    echo.
    echo You can also run psql directly from the bin directory.
    pause
    exit /b 1
)

echo ✅ PostgreSQL client found

REM Check if PostgreSQL service is running
pg_ctl status >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ PostgreSQL service is not running.
    echo.
    echo Please start PostgreSQL:
    echo 1. Open Services (services.msc)
    echo 2. Find "postgresql-x64-18" or similar
    echo 3. Right-click and select "Start"
    echo.
    echo Or run: pg_ctl start
    pause
    exit /b 1
)

echo ✅ PostgreSQL service is running

REM Try to connect as postgres user first
echo Testing connection as postgres user...
psql -U postgres -c "SELECT version();" >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ Can connect as postgres user
    goto setup_database
)

REM If postgres user doesn't work, try to connect without username (might be using Windows auth)
echo Trying to connect without specifying user...
psql -c "SELECT version();" >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ Connected using default authentication
    goto setup_database
)

REM If neither works, provide manual setup instructions
echo ❌ Cannot connect to PostgreSQL.
echo.
echo This could be because:
echo 1. PostgreSQL service is not running
echo 2. Authentication is not configured properly
echo 3. The postgres user doesn't exist or has no password
echo.
echo Let's try to set up authentication manually.
echo.
echo Press any key to continue with manual setup...
pause >nul

:manual_setup
echo.
echo Manual PostgreSQL Setup
echo =======================
echo.
echo We'll try to connect and create the necessary user and database.
echo You may be prompted for passwords during this process.
echo.

REM Try to create postgres user if it doesn't exist
echo Step 1: Creating postgres user...
psql -U postgres -c "CREATE USER IF NOT EXISTS postgres WITH PASSWORD 'postgres123';" 2>nul
if %errorlevel% neq 0 (
    echo Trying alternative connection method...
    REM Try connecting as current Windows user
    for /f "tokens=*" %%i in ('whoami') do set WINUSER=%%i
    for /f "tokens=2 delims=\" %%i in ("%WINUSER%") do set WINUSER=%%i
    echo Trying to connect as Windows user: %WINUSER%
    psql -U "%WINUSER%" -c "CREATE USER IF NOT EXISTS postgres WITH PASSWORD 'postgres123';" 2>nul
)

REM Set password and permissions
echo Step 2: Setting up user permissions...
psql -U postgres -c "ALTER USER postgres PASSWORD 'postgres123';" 2>nul
psql -U postgres -c "ALTER USER postgres CREATEDB;" 2>nul

REM Create database
echo Step 3: Creating database...
psql -U postgres -c "DROP DATABASE IF EXISTS grocere_db;" 2>nul
psql -U postgres -c "CREATE DATABASE grocere_db;" 2>nul
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE grocere_db TO postgres;" 2>nul

goto test_connection

:setup_database
echo.
echo Setting up Grocer-E database...
echo Enter password for postgres user (press Enter for default 'postgres123'):
set /p POSTGRES_PASSWORD=
if "%POSTGRES_PASSWORD%"=="" set POSTGRES_PASSWORD=postgres123

REM Create user and database
psql -U postgres -c "CREATE USER IF NOT EXISTS postgres WITH PASSWORD '%POSTGRES_PASSWORD%';" 2>nul
psql -U postgres -c "ALTER USER postgres PASSWORD '%POSTGRES_PASSWORD%';" 2>nul
psql -U postgres -c "ALTER USER postgres CREATEDB;" 2>nul
psql -U postgres -c "DROP DATABASE IF EXISTS grocere_db;" 2>nul
psql -U postgres -c "CREATE DATABASE grocere_db;" 2>nul
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE grocere_db TO postgres;" 2>nul

:test_connection
echo.
echo Testing database connection...
psql -U postgres -d grocere_db -c "SELECT version();" >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ Database setup successful!
    echo.
    echo Your .env file should contain:
    echo DB_USER=postgres
    echo DB_PASSWORD=%POSTGRES_PASSWORD%
    echo.
    echo You can now run: npm run dev
    goto end
) else (
    echo ❌ Database setup failed.
    echo.
    echo Troubleshooting steps:
    echo 1. Make sure PostgreSQL service is running
    echo 2. Check pg_hba.conf for authentication settings
    echo 3. Try running psql manually: psql -U postgres -d grocere_db
    echo 4. You may need to set a password for the postgres user
    goto end
)

:end
echo.
echo Press any key to exit...
pause >nul