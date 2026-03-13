# Fix PostgreSQL "role postgres does not exist" Error

## Problem
You're getting database connection errors saying "role postgres does not exist" or similar authentication failures.

## Solution

### Step 1: Run the Quick Fix (Recommended)
1. Open Command Prompt **as Administrator** (right-click → "Run as administrator")
2. Navigate to your backend folder:
   ```bash
   cd C:\Users\ethan\Desktop\repos\csc530\csc530-grocere-webapp\backend
   ```
3. Run the fix script:
   ```bash
   fix-postgres.bat
   ```

### Step 2: Verify .env Configuration
Make sure your `.env` file contains:
```env
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=sPec!aloN1on
```

### Step 3: Test the Connection
```bash
npm run dev
```

## If the Quick Fix Doesn't Work

### Manual Setup Steps:

1. **Start PostgreSQL Service (as Administrator):**
   ```bash
   net start postgresql-x64-18
   ```

2. **Create the postgres user:**
   ```bash
   cd "C:\Program Files\PostgreSQL\18\bin"
   psql -U postgres
   ```
   
   Inside psql, run:
   ```sql
   CREATE USER postgres WITH PASSWORD 'sPec!aloN1on';
   ALTER USER postgres CREATEDB;
   CREATE DATABASE grocere_db;
   GRANT ALL PRIVILEGES ON DATABASE grocere_db TO postgres;
   \q
   ```

3. **Test the connection:**
   ```bash
   psql -U postgres -d grocere_db -c "SELECT version();"
   ```

## Alternative: Use Windows Authentication

If you prefer to use your Windows username instead of postgres:

1. Update your `.env` file:
   ```env
   DB_USER=your_windows_username
   DB_PASSWORD=  # Leave empty for Windows auth
   ```

2. Create the database with your Windows user:
   ```bash
   createdb grocere_db
   ```

## Still Having Issues?

Run the diagnostic script:
```bash
diagnose-db.bat
```

This will show you exactly what's working and what needs to be fixed.