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
```bash
# PostgreSQL should auto-start as a service
# Open Command Prompt/PowerShell as Administrator

# Navigate to PostgreSQL bin (adjust version)
cd "C:\Program Files\PostgreSQL\16\bin"

# Create database (enter postgres password when prompted)
createdb -U postgres grocere_db

# Or using psql
psql -U postgres
CREATE DATABASE grocere_db;
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
   DB_USER=your_username
   DB_PASSWORD=your_database_password
   
   JWT_SECRET=super_secret_key_change_this
   JWT_EXPIRE=30d
   
   MIN_PASSWORD_LENGTH=8

  GEMINI_API_KEY=your_gemini_api_key
  GEMINI_MODEL=gemini-1.5-flash
   ```
   
   **Platform Notes**:
   - **Mac**: Use your macOS username as DB_USER (e.g., `koentanner`)
   - **Windows**: Use `postgres` as DB_USER (or custom user from installation)

### Step 4: Start the Server
```bash
# Development mode (auto-reload)
npm run dev

# Or production mode
npm start
```

The API will be available at `http://localhost:5000`

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
