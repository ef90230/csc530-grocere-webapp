@echo off
REM Quick PostgreSQL Fix
REM Run this as Administrator to fix postgres user issues

echo Quick PostgreSQL Fix
echo ====================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ Please run as Administrator!
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

echo ✅ Running as Administrator

echo Starting PostgreSQL service...
net start postgresql-x64-18

echo Adding PostgreSQL to PATH...
set "PATH=%PATH%;C:\Program Files\PostgreSQL\18\bin"

echo Creating postgres user...
psql -U postgres -c "CREATE USER postgres WITH PASSWORD 'sPec!aloN1on';" 2>nul
psql -U postgres -c "ALTER USER postgres PASSWORD 'sPec!aloN1on';" 2>nul
psql -U postgres -c "ALTER USER postgres CREATEDB;" 2>nul

echo Creating database...
psql -U postgres -c "CREATE DATABASE grocere_db;" 2>nul
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE grocere_db TO postgres;" 2>nul

echo Testing connection...
psql -U postgres -d grocere_db -c "SELECT 1;" >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ SUCCESS! Database is ready.
    echo Run: npm run dev
) else (
    echo ❌ Still having issues. Try the full setup script.
)

pause