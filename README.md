# csc530-grocere-webapp
This repo contains the code and content for Grocer-E, a web app designed to manage and fulfill online orders in a similar vein to Walmart's Global Integrated Fulfillment (GIF) software and other apps. This project was created as part of the Murray State University Senior Software Project.

## Set Up Your Store
Store managers can rearrange the aisles and path that pickers use to collect items for orders. You can even use AI to devise a path for you.
### What Makes a Store Efficient?
At major retailers, aisles are organized in a way to group similar items together. While the paths that customers take when shopping in-person vary a lot, it's critical that pickers are as fast as possible when collecting items off the salesfloor. Faster picking means lower wait times and less backlog for other employees waiting to sort and dispense orders. As such, a good pick path minimizes backtracking while addressing every possible aisle location in the store. For instance, a picker would not want to skip an aisle and come back to it without a very good reason to do so.

<img width="421" height="471" alt="pickpathexample" src="https://github.com/user-attachments/assets/f6e1af12-57c5-43a6-931b-c523f94b23de" />

To make your store's pick paths as efficient as possible:
- Your path should make a single loop around the store, from the backroom door back to the backroom door. Set the location of your backroom door and the aisles.
- As the picker moves through the aisles within a zone, they should snake from aisle to aisle. This ensures they don't leave an aisle the way they came in (which would increase times).
- Set one path each for ambient, chilled, frozen, and hot temperature levels. Mark the temperature type for every item and every location or those items will end up in Unknown, slowing you down.
- Keep all items locked behind magnets or cases within the Restricted commodity to eliminate the likelihood that a picker not expecting to need keys backtracking to get them.

## Fulfill Orders With Ease
### Shop Quickly and Efficiently
As customers place orders, their items will appear in sorted commodities. Separating the items this way, alongside the pick paths set by employees or the AI, will maximize picking efficiency and simplify shopping procedure. Grocer-E ensures employees will only have to focus on one type of item (ambient, chilled, frozen, hot, or oversized) on any given pick walk.
### Keep Things Organized
Grocer-E provides the digital infrastructure for employees to organize the items from different walk types. Move item groups into one location with the Staging screen to ensure customers get every item they ordered.
### Manage the Parking Lot
Customers can check in with one button to let stores know they're ready to pick up their orders.
When they check in, customer orders will appear at the top to alert you to hand the order off quickly. Use Grocer-E's prioritization tools to reduce wait times in the parking lot and keep shoppers happy. Order scheduling and timeslot limits prevent stores from being overwhelmed by excessive order volume.

## Get Feedback For Your Work
Grocer-E tracks store and employee fulfillment metrics to give you instant feedback on performance. From pick rate to wait times and beyond, Grocer-E gives your store powerful tools to fuel your operations decisions.
### Track Item Issues and Correct Them
To power Grocer-E's powerful algorithmic paths, stores are set up with a database of item locations by aisle. You can search and filter through these item listings to locate common issues, such as items sold out.
- By aisle/section - The default. Use this to check aisles one by one.
- By item category - Identifies items from one department that may be scanned into the area of a different, wrong, department.
- No locations only - Identifies items with no known location that may be difficult to locate in pick walks and when customers shop.
- Alphabetical order and reverse alphabetical order - Locate a specific item by name if you can’t remember the exact name for the search bar.
- Reverse On Hand order - Identifies items out of stock or close to out of stock.
### Metric Definitions
- Pick Rate - The rate per hour at which items are shopped.
- First-Time Pick % (FTP) - The percent of items found at the first opportunity during a pick walk. Even if an item is found without substituting, if the employee scanned the wrong item beforehand, it is a failure for this metric's purposes.
- Pre-Substitution % - The percent of items ordered fulfilled by the original item only.
- Post-Substitution % - The percent of items ordered fulfilled either by the original item or a substitute.
- On-Time % - The percent of items shopped without going overdue.
- Weighted Efficiency - A special score assigned as an aggregate of the employee/store's pick rate and FTP. A perfect score results from a pick rate >= 100.00 items/hour and FTP of 100%.

## Development

### Backend Scripts

The backend includes several npm scripts for development and server management:

- `npm start` - Start the production server
- `npm run dev` - Start the development server with auto-reload (nodemon)
- `npm run stop` - Kill any process running on port 5000
- `npm run restart` - Stop and restart the production server
- `npm run restart:dev` - Stop and restart the development server
- `npm test` - Run unit and integration tests with coverage
- `npm run test:watch` - Run tests in watch mode

### Database Setup

See `BACKEND_SETUP.md` for detailed database configuration instructions.

**Quick Fix for Database Issues:**
If you get "role postgres does not exist" errors:
1. Run `backend/fix-postgres.bat` as Administrator
2. Update `.env`: `DB_HOST=localhost`
3. Run `npm run dev`

See `backend/POSTGRES_FIX.md` for detailed troubleshooting.

## Testing

Both unit and end-to-end tests are included to validate critical business logic such as the order scheduling rules.  Backend tests are written with Jest and Supertest, and the frontend contains a simple Cypress spec for smoke‑level API checks.

### Backend

1. Configure your database connection using environment variables (Postgres required).
2. In `backend` run:
   ```bash
   npm install
   npm test       # runs all Jest suites including schedulingService and integration tests
   npm test -- --runTestsByPath tests/unit/schedulingService.test.js  # run specific file
   ```
3. Tests create and tear down their own data; make sure the test database is accessible and can be dropped.

The scheduling unit suite (`backend/tests/unit/schedulingService.test.js`) exercises every restriction:
- no pickups between midnight–8 AM
- minimum 3‑hour advance notice
- maximum seven‑day lead time
- hourly capacity of 20 orders
- automatic purge of orders older than 48 hours

Integration/E2E coverage (`backend/tests/integration/schedulingRoutes.test.js`) exercises the corresponding HTTP endpoints, including a manager‑only purge call.

### Frontend

A Cypress spec (`frontend/cypress/E2E/scheduling.spec.js`) makes real HTTP requests against the running API to verify the rules from the customer’s perspective.

Run Cypress with:
```bash
cd frontend
npm install
npm run cypress:open   # or npm run cypress:run
```

## CRUD Pipelines and Other Documentation

The backend exposes a set of RESTful pipelines that correspond to the main domain objects.  Every pipeline uses standard HTTP verbs and JSON bodies, and many are protected by JWT authentication and role checks (see the **Testing** section for examples that exercise these endpoints).

### Authentication

* `POST /api/auth/register/customer` — create a new customer account
* `POST /api/auth/register/employee` — create a new employee (manager only in production)
* `POST /api/auth/login` — obtain JWT token for either user type
* `GET /api/auth/me` — retrieve details about the authenticated user (token required)

Tokens returned from `login` must be sent in the `Authorization: Bearer ...` header on all subsequent protected requests.

### Employees & Customers

These endpoints are restricted to authenticated employees (and in some cases managers):

* `GET /api/employees` — list all employees for the store
* `GET /api/employees/:id` — fetch one employee
* `PATCH /api/employees/:id` — update an employee’s profile or role
* `DELETE /api/employees/:id` — deactivate/remove an employee

* `GET /api/customers` — list registered customers
* `GET /api/customers/:id` — customer detail
* `PATCH /api/customers/:id` — update customer info
* `DELETE /api/customers/:id` — deactivate a customer

### Items, Aisles and Locations

These pipelines allow managers to maintain inventory maps:

* `GET /api/items`, `GET /api/items/:id`, `POST /api/items`, `PATCH /api/items/:id`, `DELETE /api/items/:id`
* `GET /api/aisles`, `POST /api/aisles`, `PATCH /api/aisles/:id`, `DELETE /api/aisles/:id`
* `GET /api/locations`, `POST /api/locations`, etc.

Search, filtering, and sorting logic are implemented server‑side and used by the employee UI (see **InventoryScreen** code).

### Cart

Customers manage their shopping cart through these endpoints (all require a valid customer token):

* `GET /api/cart` — retrieve current cart (auto‑created if missing)
* `POST /api/cart/add` — add or increment an item
* `PATCH /api/cart/update` — change quantity or notes
* `DELETE /api/cart/remove` — remove a specific cart item
* `DELETE /api/cart/clear` — empty the cart
* `POST /api/cart/store` — select a store for fulfillment

### Orders & Scheduling

The order pipeline handles checkout and many business rules:

* `POST /api/orders` — place an order; body must include `scheduledPickupTime` and will be validated against the five scheduling constraints
* `GET /api/orders` — list orders (customer sees own orders, employees see store orders)
* `GET /api/orders/:id` — order detail
* `PATCH /api/orders/:id` — update order (status changes, assignee assignments)
* `DELETE /api/orders/:id` — cancel an order

Scheduling-specific helpers (see **schedulingService.js**):

* `GET /api/orders/scheduling/slots/:storeId` — available pickup slots
* `GET /api/orders/scheduling/next/:storeId` — next open slot
* `POST /api/orders/scheduling/validate/:storeId` — check a particular timestamp
* `POST /api/orders/scheduling/purge` — purge aged orders (manager only)

### Pick Paths & Store Layout

Managers configure pick routes with:

* `GET /api/pickpaths` — fetch existing paths
* `POST /api/pickpaths` — create a new path (often from AI proposal)
* `PATCH /api/pickpaths/:id` — update coordinates or metadata
* `DELETE /api/pickpaths/:id` — remove an outdated path

Aisle and location coordinates are updated via a batch endpoint used by the MapScreen canvas.

### Contributing

For development, run the backend with `npm run dev` and the frontend with `npm start`.  The two parts communicate over `http://localhost:5000` by default.  See `BACKEND_SETUP.md` for database configuration and Docker instructions.

Feel free to extend these pipelines as the application grows.
