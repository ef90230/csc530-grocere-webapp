@echo off
REM PostgreSQL Connection Diagnostic Script
REM This script helps diagnose PostgreSQL connection issues

echo PostgreSQL Connection Diagnostics
echo =================================

echo.
echo 0. Adding PostgreSQL to PATH...
set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
set "PATH=%PATH%;%PG_BIN%"

echo.
echo 1. Checking if psql is in PATH...
where psql >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ psql found in PATH
    for /f "tokens=*" %%i in ('where psql') do echo    Location: %%i
) else (
    echo ❌ psql not found in PATH
    echo    Common locations to check:
    echo    - C:\Program Files\PostgreSQL\18\bin
    echo    - C:\Program Files\PostgreSQL\17\bin
    echo    - C:\Program Files\PostgreSQL\16\bin
    echo.
    echo    To fix: Run fix-path.bat first
    goto end
)

echo.
echo 2. Checking if PostgreSQL service is running...
pg_ctl status >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ PostgreSQL service is running
) else (
    echo ❌ PostgreSQL service is not running or pg_ctl not in PATH
    echo    Try: pg_ctl start
    echo    Or check Windows Services for postgresql-x64-18
)

echo.
echo 3. Testing basic connection...
psql -c "SELECT version();" >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ Can connect to PostgreSQL (using default authentication)
) else (
    echo ❌ Cannot connect using default authentication
)

echo.
echo 4. Testing connection as postgres user...
psql -U postgres -c "SELECT version();" >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ Can connect as postgres user
) else (
    echo ❌ Cannot connect as postgres user
    echo    This user may not exist or may require a password
)

echo.
echo 5. Checking for grocere_db database...
psql -U postgres -l | findstr grocere_db >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ grocere_db database exists
) else (
    echo ❌ grocere_db database does not exist
)

echo.
echo 6. Testing connection to grocere_db...
psql -U postgres -d grocere_db -c "SELECT 1;" >nul 2>nul
if %errorlevel% equ 0 (
    echo ✅ Can connect to grocere_db database
) else (
    echo ❌ Cannot connect to grocere_db database
)

echo.
echo Diagnostics complete.
echo.
echo If you see ❌ marks above, check the troubleshooting section in BACKEND_SETUP.md
echo.
pause