# Grocer-E Backend API

Backend API for the Grocer-E grocery fulfillment system. This RESTful API powers store management, order fulfillment, employee tracking, and customer interactions.

## Features

✅ **Authentication & Authorization**
- JWT-based authentication
- Role-based access control (Manager, Picker, Stager, Dispenser)
- Password validation with minimum character requirements
- Separate authentication for employees and customers

✅ **Employee Management**
- CRUD operations for employees
- Performance metrics tracking (pick rate, FTP%, efficiency scores)
- Store assignment

✅ **Customer Management**
- Customer registration and profiles
- Check-in/check-out for order pickup
- Order history

✅ **Inventory Management**
- Item catalog with locations
- Stock availability tracking
- Multi-location support per item
- Filter by category, department, commodity, temperature

✅ **Order Management**
- Order creation and tracking
- Status workflow (pending → picking → staged → ready → completed)
- Order item tracking with substitution support
- Commodity-based grouping for efficient picking

✅ **AI-Powered Pick Path Generation**
- Automated path optimization for each commodity type
- Snake pattern through aisles
- Minimize backtracking
- Efficiency scoring
- Custom path creation and management

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: express-validator
- **Password Hashing**: bcryptjs
- **Testing**: Jest & Supertest

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Set up environment variables**
   
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   NODE_ENV=development
   PORT=5000
   
   # Database
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=grocere_db
   DB_USER=your_username
   DB_PASSWORD=your_database_password
   
   # JWT
   JWT_SECRET=your_secret_key_here
   JWT_EXPIRE=30d
   
   # Password Requirements
   MIN_PASSWORD_LENGTH=8
   ```
   
   **Platform-Specific Notes**:
   - **Mac (Homebrew)**: Use your macOS username as DB_USER (e.g., `koentanner`)
   - **Windows**: Use `postgres` as DB_USER (default) or the username you created during installation

3. **Set up PostgreSQL database**
   
   ### macOS (Homebrew)
   ```bash
   # Start PostgreSQL
   brew services start postgresql@18
   # or
   pg_ctl -D /usr/local/var/postgresql@18 start
   
   # Create database
   createdb grocere_db
   
   # Optional: Set password for your user
   psql -d grocere_db
   ALTER USER your_mac_username WITH PASSWORD 'your_password';
   \q
   ```
   
   ### Windows
   ```bash
   # PostgreSQL should start automatically as a service
   # If not, start it from Services or:
   # Win + R -> services.msc -> Find "postgresql-x64-XX" -> Start
   
   # Open Command Prompt or PowerShell as Administrator
   # Navigate to PostgreSQL bin directory (adjust version as needed)
   cd "C:\Program Files\PostgreSQL\16\bin"
   
   # Create database
   createdb -U postgres grocere_db
   # Enter password when prompted (set during PostgreSQL installation)
   
   # Or using psql
   psql -U postgres
   # Enter password when prompted
   CREATE DATABASE grocere_db;
   \q
   ```
   
   **Windows Note**: If PostgreSQL bin directory is not in PATH, you'll need to use the full path or add it to your system PATH environment variable.
   ```

4. **Start the server**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm start
   ```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login (employee or customer)
- `POST /api/auth/register/employee` - Register employee
- `POST /api/auth/register/customer` - Register customer
- `GET /api/auth/me` - Get current user profile

### Employees
- `GET /api/employees` - Get all employees (Manager)
- `GET /api/employees/:id` - Get employee by ID
- `GET /api/employees/:id/metrics` - Get employee performance metrics
- `POST /api/employees` - Create employee (Manager)
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Deactivate employee (Manager)

### Customers
- `GET /api/customers` - Get all customers (Manager)
- `GET /api/customers/:id` - Get customer by ID
- `GET /api/customers/checkedin/:storeId` - Get checked-in customers
- `PUT /api/customers/:id` - Update customer
- `POST /api/customers/:id/checkin` - Check in for pickup
- `POST /api/customers/:id/checkout` - Check out after pickup

### Items/Inventory
- `GET /api/items` - Get all items (with filters)
- `GET /api/items/:id` - Get item by ID
- `GET /api/items/store/:storeId/available` - Get available items at store
- `GET /api/items/:id/availability/:storeId` - Check item availability
- `POST /api/items` - Create item (Manager)
- `PUT /api/items/:id` - Update item (Manager)
- `PUT /api/items/:id/location/:locationId` - Update inventory
- `DELETE /api/items/:id` - Deactivate item (Manager)

### Orders
- `GET /api/orders` - Get all orders (with filters)
- `GET /api/orders/:id` - Get order by ID
- `GET /api/orders/picking/:storeId` - Get orders for picking
- `POST /api/orders` - Create order
- `PUT /api/orders/:id/status` - Update order status
- `PUT /api/orders/:id/items/:itemId` - Update order item
- `DELETE /api/orders/:id` - Cancel order

### Pick Paths
- `GET /api/pickpaths/store/:storeId` - Get pick paths for store
- `GET /api/pickpaths/:id` - Get pick path by ID
- `POST /api/pickpaths/generate` - Generate AI-optimized path (Manager)
- `POST /api/pickpaths/generate/all` - Generate all paths (Manager)
- `POST /api/pickpaths` - Create custom path (Manager)
- `PUT /api/pickpaths/:id` - Update pick path (Manager)
- `PUT /api/pickpaths/:id/activate` - Activate pick path (Manager)
- `DELETE /api/pickpaths/:id` - Delete pick path (Manager)

## Database Schema

### Core Tables
- **employees** - Employee profiles and metrics
- **customers** - Customer profiles and check-in status
- **stores** - Store locations and configuration
- **aisles** - Store aisles organization
- **locations** - Specific shelf/bin locations
- **items** - Product catalog
- **item_locations** - Item inventory at locations
- **orders** - Customer orders
- **order_items** - Items in orders with status
- **pick_paths** - Optimized picking paths

## Password Requirements

Passwords must meet the following criteria:
- Minimum 8 characters (configurable via `MIN_PASSWORD_LENGTH`)
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## Form Validation

Login form validation includes:
- Valid email format
- Password field required
- User type specification (employee/customer)

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm test -- --coverage
```

## Project Structure

```
backend/
├── config/
│   └── db.js              # Database configuration
├── controllers/
│   ├── authController.js
│   ├── customerController.js
│   ├── employeeController.js
│   ├── itemController.js
│   ├── orderController.js
│   └── pickPathController.js
├── middleware/
│   ├── auth.js            # Authentication & authorization
│   └── validation.js      # Form validation rules
├── models/
│   ├── index.js           # Model relationships
│   ├── Employee.js
│   ├── Customer.js
│   ├── Store.js
│   ├── Aisle.js
│   ├── Location.js
│   ├── Item.js
│   ├── ItemLocation.js
│   ├── Order.js
│   ├── OrderItem.js
│   └── PickPath.js
├── routes/
│   ├── auth.js
│   ├── customers.js
│   ├── employees.js
│   ├── items.js
│   ├── orders.js
│   └── pickPaths.js
├── tests/
│   ├── integration/
│   └── unit/
├── utils/
│   └── pathGenerator.js   # AI path generation algorithm
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js              # Application entry point
```

## Pick Path Algorithm

The AI-powered pick path generation uses:
1. **Greedy nearest-neighbor** algorithm for location sequencing
2. **Snake pattern** optimization through aisles
3. **Commodity grouping** (ambient, chilled, frozen, hot, oversized, restricted)
4. **Efficiency scoring** based on distance and backtracking metrics

The algorithm ensures:
- Single loop from backroom to backroom
- No backtracking to previously visited aisles
- Optimal order for temperature-sensitive items

## Performance Metrics

The system tracks:
- **Pick Rate** - Items per hour
- **First-Time Pick %** - Items found on first scan
- **Pre-Substitution %** - Original items fulfilled
- **Post-Substitution %** - Items fulfilled including substitutes
- **On-Time %** - Orders completed before deadline
- **Weighted Efficiency** - Composite score

## Development

```bash
# Install nodemon for auto-reload
npm install -g nodemon

# Run in development mode
npm run dev
```

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running: `pg_isready`
- Check credentials in `.env`
- Ensure database exists: `psql -l`

### Port Already in Use
- Change `PORT` in `.env`
- Or kill process: `lsof -ti:5000 | xargs kill`

### Module Not Found
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

## Contributing

This is a senior software project. For contributions:
1. Create feature branches
2. Write tests for new features
3. Follow existing code style
4. Update documentation

## License

Academic project - Murray State University

## Team

- Backend Developer: Koen Tanner
- Frontend Developer: Ethan Fowler
- Course: CSC 530 - Senior Software Project
