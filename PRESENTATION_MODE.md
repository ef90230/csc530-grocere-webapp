# Grocer-E Presentation Mode Guide

Use this guide to demonstrate Grocer-E on phones without needing to run the development servers.

## Quick Start (5 minutes)

### One-Time Setup

1. **Build the frontend** (creates production bundle):
   ```bash
   cd frontend
   npm run build
   ```
   This generates optimized files in `frontend/build/`

### For Each Presentation Session

1. **Start the backend server** (from the project root directory):
   ```bash
   cd backend
   npm run dev
   ```
   If `backend/certs/server-key.pem` and `backend/certs/server-cert.pem` exist, the server will run on HTTPS automatically.

2. **Access on your phones**:
   - **Same WiFi network over HTTPS**: Open browser on phone and go to:
     ```
     https://<YOUR_LAPTOP_IP>:5000
     ```
     Find your laptop IP:
     - **Mac**: Open Terminal, run: `ifconfig | grep inet`
     - **Windows**: Open Command Prompt, run: `ipconfig` (look for IPv4 Address)
     - **Example**: `https://192.168.1.42:5000`
     - **Important**: This only works if you use a trusted local certificate.

    - **Hotspot**: Connect phones to laptop hotspot, then use the matching `https://...:5000` address for the hotspot gateway IP

3. **If this is your first time using HTTPS locally**:
   Generate a trusted cert with mkcert:
   ```bash
   mkcert -install
   mkdir -p backend/certs
   mkcert -key-file backend/certs/server-key.pem -cert-file backend/certs/server-cert.pem localhost 127.0.0.1 192.168.1.33
   ```
   Then restart the backend and use the `https://` address above.

3. **Log in** with test credentials:
   - Employee: `employee@test.com` / `password123`
   - Manager: `manager@test.com` / `password123`
   - Customer: `customer@test.com` / `password123`

## Features to Demo

### Employee Features
- **Pick Orders**: Navigate to home → picking → select commodity → scan items
- **View Staging**: Organize picked items into staging areas
- **Statistics**: See performance metrics

### Manager Features
- All employee features plus:
- **Store Configuration**: Set up aisles and item locations (Map Screen)
- **Generate Pick Paths**: Create optimal routes for order picking
- **Inventory Management**: Add/edit items and locations

### Customer Features
- **Browse Items**: Shop for products
- **Cart Management**: Add items and manage quantities
- **Schedule Pickup**: Select store and time
- **Track Orders**: See order status in real-time

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Can't connect** | Verify laptop and phones on same WiFi; check firewall; try `ping <LAPTOP_IP>` |
| **Page shows "Cannot GET"** | Backend may have crashed; restart with `npm run dev` |
| **Camera not working** | Use the HTTPS URL and make sure the certificate is trusted on the phone |
| **Data persists from previous runs** | Database resets each time; seed fresh data with `npm run seed:inventory` in backend |
| **Port 5000 already in use** | Run `npm run stop` to kill the process, then restart |

## What's Running

- **Backend API**: Handles all business logic, authentication, orders, inventory
- **Frontend UI**: React app served as static files from backend
- **Database**: PostgreSQL (must be running per BACKEND_SETUP.md)
- **Single URL**: Everything is accessible from one IP:port address

## Environment Notes

The app is built for production mode:
- `frontend/.env.production` sets API calls to use relative `/api` URLs
- All requests go through the same server automatically
- No CORS issues since frontend is served by backend
- HTTPS starts automatically when trusted cert files are present in `backend/certs/`

---

**Total duration**: ~1 minute to build once, ~10 seconds to start for each session.
