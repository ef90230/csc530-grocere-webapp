@echo off
REM Backend Scripts Helper
REM Shows available npm scripts for the Grocer-E backend

echo Grocer-E Backend Scripts
echo ========================
echo.
echo Available commands:
echo.
echo Development:
echo   npm start          - Start production server
echo   npm run dev        - Start development server (with auto-reload)
echo   npm run stop       - Kill process on port 5000
echo   npm run restart    - Stop and restart production server
echo   npm run restart:dev - Stop and restart development server
echo.
echo Testing:
echo   npm test           - Run all tests with coverage
echo   npm run test:watch - Run tests in watch mode
echo.
echo Database:
echo   setup-db.bat       - Set up PostgreSQL database
echo   setup-postgres.bat - Complete PostgreSQL setup (Admin required)
echo   fix-postgres.bat   - Quick fix for postgres user issues (Admin required)
echo   diagnose-db.bat    - Diagnose database connection issues
echo   fix-path.bat       - Add PostgreSQL to PATH
echo.
echo Examples:
echo   npm run dev        (start development)
echo   npm run stop       (stop if port 5000 is busy)
echo   npm run restart:dev (restart development server)
echo.
pause