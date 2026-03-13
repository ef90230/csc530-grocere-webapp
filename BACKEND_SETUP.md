# Grocer-E Backend - Quick Start Guide

## ✅ Completed Tasks

### 1. ✅ Database Tables & Controllers
- Created comprehensive database schema with 10 models
- Implemented controllers for:
  - **Customers** - Registration, check-in/out, profile management
  - **Employees** - CRUD, performance metrics
  - **Items/Inventory** - Product catalog, stock tracking, availability checks
  - **Orders** - Order creation, status tracking, item management

### 2. ✅ Authentication & Security
- **Password Validation**: Minimum 8 characters (configurable), requires uppercase, lowercase, number, and special character
- **Login Form Validation**: Email format validation, required fields, user type handling
- JWT-based authentication with role-based access control

### 3. ✅ Item Management Features
- **Manager View**: Access all item information, filter by aisle/section/category
- **Organization Analytics**: Sort items to identify:
  - Items with no locations
  - Out of stock items
  - Items in wrong departments
  - Alphabetical sorting for easy lookup

### 4. ✅ Item Availability for Shoppers
- Public endpoints to check item availability at stores
- Real-time stock information
- Filter available items by category/department
- Shows primary location and total stock

### 5. ✅ AI-Powered Pick Path Generation
- Intelligent path generation algorithm for efficient picking
- Supports all commodity types (ambient, chilled, frozen, hot, oversized, restricted)
- Snake pattern optimization through aisles
- Efficiency scoring and metrics
- Single loop from backroom to backroom (best practice)

## 🚀 Getting Started

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

### Step 2: Set Up Database

#### Quick Setup (Recommended)
Run the automated setup script:

**Windows:**
```bash
# Run the setup script (it will prompt for password)
setup-db.bat
```

**macOS/Linux:**
```bash
# Make script executable and run
chmod +x setup-db.sh
./setup-db.sh
```

**Diagnose Issues:**
If you're having connection problems, run the diagnostic script:

```bash
# Windows
diagnose-db.bat
```

The diagnostic script will check:
- PostgreSQL installation and PATH
- Service status
- Authentication methods
- Database existence
- Connection permissions

#### Manual Setup

If you prefer to set up manually:

#### For macOS (Homebrew):
```bash
# Start PostgreSQL
brew services start postgresql@18

# Create database
createdb grocere_db

# Optional: Set password
psql -d grocere_db
ALTER USER your_mac_username WITH PASSWORD 'your_password';
\q
```

#### For Windows:
**Important: You must run these commands as Administrator**

1. **Start PostgreSQL Service:**
   ```bash
   # Open Command Prompt as Administrator (right-click → Run as administrator)
   
   # Start the service
   net start postgresql-x64-18
   
   # Or use PowerShell as Administrator:
   Start-Service postgresql-x64-18
   ```

2. **Set up the postgres user:**
   ```bash
   # Navigate to PostgreSQL bin directory
   cd "C:\Program Files\PostgreSQL\18\bin"
   
   # Connect and set password
   psql -U postgres
   
   # Inside psql, run:
   ALTER USER postgres PASSWORD 'your_password_here';
   ALTER USER postgres CREATEDB;
   \q
   ```

3. **Create database:**
   ```bash
   # Create the database
   psql -U postgres -c "CREATE DATABASE grocere_db;"
   
   # Grant permissions
   psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE grocere_db TO postgres;"
   ```

4. **Test connection:**
   ```bash
   psql -U postgres -d grocere_db -c "SELECT version();"
   ```

**Alternative: Use your Windows username**
If you prefer not to use 'postgres', you can use your Windows username:
```bash
# Create database with your Windows username
createdb grocere_db

# Set a password for your user
psql -d grocere_db
ALTER USER "YourWindowsUsername" WITH PASSWORD 'your_password';
\q
```

**Alternative: Use your Windows username**
If you prefer not to use 'postgres', you can use your Windows username:
```bash
# Create database with your Windows username
createdb grocere_db

# Set a password for your user
psql -d grocere_db
ALTER USER "YourWindowsUsername" WITH PASSWORD 'your_password';
\q
```

### Step 3: Configure Environment
1. Copy the example file:
   ```bash
   # Mac/Linux
   cp .env.example .env
   
   # Windows (PowerShell)
   copy .env.example .env
   ```

2. Edit `.env` with your settings:
   ```env
   NODE_ENV=development
   PORT=5000
   
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=grocere_db
   DB_USER=postgres
   DB_PASSWORD=your_password_here
   
   JWT_SECRET=super_secret_key_change_this
   JWT_EXPIRE=30d
   
   MIN_PASSWORD_LENGTH=8

   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_MODEL=gemini-1.5-flash
   ```
   
   **Important**: If you created the postgres user with a password in Step 2, use that password here. If you're using your Windows username instead, change `DB_USER` to your Windows username.
```

The API will be available at `http://localhost:5000`

## 🔧 Troubleshooting Database Connection Issues

### Quick Fix: Use Setup Scripts
If you're having issues, try the automated setup scripts:
- **Windows**: Run `setup-db.bat`
- **macOS/Linux**: Run `chmod +x setup-db.sh && ./setup-db.sh`

These scripts handle user creation, database setup, and permission granting automatically.

#### Quick Fix for "role postgres does not exist"

If you're getting database connection errors, run this quick fix:

**Windows (Run as Administrator):**
```bash
# Navigate to backend folder
cd backend

# Run the quick fix script
fix-postgres.bat
```

**Manual Steps (if script doesn't work):**

1. **Start PostgreSQL as Administrator:**
   ```bash
   # Open Command Prompt as Administrator
   net start postgresql-x64-18
   ```

2. **Create postgres user:**
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

3. **Update .env file:**
   ```env
   DB_HOST=localhost
   DB_USER=postgres
   DB_PASSWORD=sPec!aloN1on
   ```

4. **Test connection:**
   ```bash
   psql -U postgres -d grocere_db -c "SELECT version();"
   ```

### "PostgreSQL service is not running" Error
PostgreSQL service needs to be started as Administrator:

```bash
# As Administrator
net start postgresql-x64-18

# Or use Services GUI:
# 1. Press Win+R, type services.msc
# 2. Find postgresql-x64-18
# 3. Right-click → Start
```

### "authentication failed for user 'postgres'" Error
The postgres user exists but the password is wrong. Reset it:

```bash
psql -U postgres
ALTER USER postgres PASSWORD 'your_new_password';
\q
```

### "database 'grocere_db' does not exist" Error
Create the database:

```bash
psql -U postgres -c "CREATE DATABASE grocere_db;"
```

### Connection Refused
- Make sure PostgreSQL service is running: `pg_ctl status` or check Windows Services
- Verify DB_HOST and DB_PORT in .env match your PostgreSQL installation
- Try connecting manually: `psql -U postgres -d grocere_db`

### Permission Denied
Grant proper permissions:

```bash
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE grocere_db TO postgres;"
```

### Authentication Issues
If you get "authentication failed" errors:

1. **Check pg_hba.conf** (usually at `C:\Program Files\PostgreSQL\18\data\pg_hba.conf`):
   - Look for lines allowing local connections
   - You might need to change `md5` to `trust` for local development

2. **Reset postgres password**:
   ```bash
   # Stop PostgreSQL service first
   pg_ctl stop

   # Start in single-user mode
   pg_ctl start -o "-c listen_addresses=''"

   # In another terminal, reset password
   psql -U postgres -c "ALTER USER postgres PASSWORD 'new_password';"

   # Stop and restart normally
   pg_ctl stop
   pg_ctl start
   ```

### Step 5: Verify AI Path API (Optional)
Use a manager JWT token and call:

```bash
curl -X POST http://localhost:5000/api/pickpaths/generate/ai \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MANAGER_JWT" \
  -d '{
    "storeId": 1,
    "commodity": "ambient",
    "userId": 1,
    "pathName": "AI Suggested Ambient Path",
    "savePath": true
  }'
```

Additional manager endpoints:
- `GET /api/pickpaths/store/:storeId/linked-list?commodity=ambient`
- `GET /api/items/store/:storeId/insights`

## 📋 API Endpoints Summary

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register/employee` - Register employee
- `POST /api/auth/register/customer` - Register customer
- `GET /api/auth/me` - Get current user

### For Your Frontend

#### Customer Features
```javascript
// Register customer (with validation)
POST /api/auth/register/customer
{
  "customerId": "CUST001",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "phone": "555-1234"
}

// Check item availability
GET /api/items/:itemId/availability/:storeId

// Get available items at store
GET /api/items/store/:storeId/available?inStockOnly=true

// Create order
POST /api/orders
{
  "customerId": 1,
  "storeId": 1,
  "scheduledPickupTime": "2024-03-15T14:00:00Z",
  "items": [
    { "itemId": 1, "quantity": 2 },
    { "itemId": 2, "quantity": 1 }
  ]
}

// Check in for pickup
POST /api/customers/:id/checkin
{
  "vehicleInfo": "Blue Honda Civic",
  "parkingSpot": "A3"
}
```

#### Manager Features
```javascript
// View items by aisle
GET /api/items?storeId=1&sortBy=category

// View items with no location
GET /api/items?storeId=1&noLocation=true

// View out of stock items
GET /api/items?storeId=1&inStock=false

// Generate AI pick path
POST /api/pickpaths/generate
{
  "storeId": 1,
  "commodity": "ambient",
  "pathName": "Main Floor Path",
  "userId": 1
}

// Generate all paths at once
POST /api/pickpaths/generate/all
{
  "storeId": 1,
  "userId": 1
}

// Get employee metrics
GET /api/employees/:id/metrics
```

#### Employee Features
```javascript
// Get orders for picking
GET /api/orders/picking/:storeId?commodity=frozen

// Update order status
PUT /api/orders/:id/status
{
  "status": "picking",
  "assignedPickerId": 1
}

// Update order item (during picking)
PUT /api/orders/:id/items/:itemId
{
  "status": "found",
  "attemptCount": 1,
  "pickedQuantity": 2
}

// Update inventory
PUT /api/items/:itemId/location/:locationId
{
  "quantityOnHand": 50,
  "storeId": 1
}
```

## 🔐 Authentication Headers

All protected endpoints require authentication. Include the JWT token:

```javascript
headers: {
  'Authorization': 'Bearer YOUR_JWT_TOKEN',
  'Content-Type': 'application/json'
}
```

## 🗄️ Database Schema Overview

The database automatically creates these tables:
- **employees** - Store staff with performance metrics
- **customers** - Shoppers with order history
- **stores** - Store locations
- **aisles** - Store aisle organization
- **locations** - Specific shelf/section locations
- **items** - Product catalog
- **item_locations** - Inventory at each location
- **orders** - Customer orders
- **order_items** - Individual items in orders
- **pick_paths** - Optimized picking routes

## 📊 Performance Metrics Tracked

The system automatically calculates:
- **Pick Rate** - Items per hour
- **First-Time Pick %** - Items found on first scan
- **Pre/Post-Substitution %** - Fulfillment rates
- **On-Time %** - Orders completed before deadline
- **Weighted Efficiency** - Overall score

## 🧪 Testing

Run tests with:
```bash
npm test
```

The test files are set up at:
- `tests/unit/controllers/`
- `tests/unit/middleware/`
- `tests/integration/`

## 📝 Next Steps for Frontend Integration

1. **Create API service layer** in frontend to call these endpoints
2. **Store JWT token** in localStorage or httpOnly cookies
3. **Implement login page** using `/api/auth/login`
4. **Add form validation** matching the backend requirements
5. **Test the item availability** endpoint for customer shopping
6. **Test pick path generation** for manager features

## 🆘 Troubleshooting

### "Cannot connect to database"
- Check PostgreSQL is running: `brew services start postgresql` (Mac)
- Verify credentials in `.env`

### "Port 5000 already in use"
- Change PORT in `.env` or kill the process

### "JWT must be provided"
- Include Authorization header with Bearer token
