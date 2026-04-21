# Grocer-E Hardware Setup and Physical Accessories Guide

This document reflects what the app actually needs today: a browser-based frontend (React), a Node/Express API, PostgreSQL, and camera barcode scanning from mobile/tablet devices.

## 1. What This App Requires

Grocer-E does not require specialized enterprise hardware to run reliably for most stores. Core requirements are:

- Stable local network coverage in picking and staging areas
- Mobile devices with decent camera autofocus
- A backend host for Node + PostgreSQL (local server or cloud VM)
- Charging and device protection for daily operations

## 2. Client Device Requirements (Pickers, Stagers, Leads)

### Minimum practical device spec

- CPU: modern mid-range phone/tablet processor (last 4-5 years)
- RAM: 3 GB minimum (4 GB preferred)
- Camera: rear camera with autofocus
- Battery: enough for 4-6 hour active shift use, or swap/charge plan
- Display: 6.1" phone or 8" in tablet minimum

### Recommended for smoother scanning

- RAM: 4-8 GB
- Camera: 1080p+ rear camera with fast autofocus
- Display: 8-11" tablet if device is cart-mounted
- Rugged case and screen protector

### Supported browser/runtime targets

- iOS Safari 15+ (or Chrome on iOS)
- Android Chrome 110+
- Desktop Chrome/Edge for manager/admin screens

## 3. Permissions Actually Needed

The app currently needs:

- Camera: required for barcode scan flows
- Network access: required for API calls

Not currently required by core workflows:

- Microphone
- Background location
- Bluetooth (unless using external scanner hardware)

## 4. Barcode Scanning Reality

The app uses:

- Native BarcodeDetector API when available
- ZXing fallback for compatibility

Supported formats in current flows include UPC/EAN and common 1D warehouse formats.

Practical scanning guidance:

- Distance: roughly 4-12 inches
- Keep barcode flat to camera
- Ensure aisle lighting is sufficient and avoid glare
- Clean camera lens regularly

## 5. Backend Host Requirements

These specs are realistic for this app's current load pattern (HTTP APIs + periodic polling; no heavy streaming).

### Small deployment (single store, low to moderate traffic)

- 2 vCPU
- 4 GB RAM
- 60-100 GB SSD
- Ubuntu 22.04 LTS (recommended) or similar Linux
- PostgreSQL on same host is acceptable

### Recommended baseline (most stores)

- 4 vCPU
- 8 GB RAM
- 100-200 GB SSD
- Daily backups for PostgreSQL
- Node process manager (pm2/systemd) and restart policy

### High-volume / multi-store backend

- 8+ vCPU
- 16+ GB RAM
- 250+ GB SSD
- Separate managed PostgreSQL instance
- Reverse proxy + TLS termination (Nginx or cloud load balancer)

## 6. Network Requirements

### Practical targets

- API roundtrip in-store: usually under 200 ms
- WiFi signal in work zones: at least -67 dBm preferred
- Consistent 5 GHz coverage in picking/staging areas

### Throughput

- App traffic is light to moderate; reliability matters more than peak bandwidth
- 50-100 Mbps internet is typically sufficient for one store if backend is remote
- If backend is on local LAN, prioritize LAN stability over internet speed

## 7. Physical Accessories That Matter Most

- Rugged case with hand strap for phones/tablets
- Cart mount for tablet workflows
- Multi-bay charging dock in backroom
- 1 spare charged device per shift for continuity
- Optional Bluetooth scanner for fallback in poor camera conditions

## 8. Store Size Planning

### Small store (up to ~75 active fulfillment orders/day)

- 2-3 mobile devices
- 1-2 spare chargers/battery packs
- 1 backend host (or cloud VM)

### Medium store (~75-300 orders/day)

- 4-8 mobile devices
- At least 2 APs with overlap in staging/picking zones
- Recommended baseline backend (4 vCPU/8 GB)

### Larger operation (300+ orders/day)

- 8+ mobile devices
- Full coverage WiFi plan and channel tuning
- 8 vCPU/16 GB backend and separate PostgreSQL

## 9. Reliability Checklist

### Before go-live

- [ ] Confirm camera permission on each device
- [ ] Walk test WiFi in every pick aisle and staging area
- [ ] Validate barcode scan speed on representative products
- [ ] Verify backend auto-restart after reboot/crash
- [ ] Configure DB backups and restore test

### Ongoing operations

- [ ] Weekly check of failed API requests and slow endpoints
- [ ] Battery health check for devices used on shift
- [ ] Camera lens cleaning routine
- [ ] Verify available storage on backend host

## 10. Common Hardware/Environment Issues

### Slow or failed scans

- Improve aisle lighting
- Clean lens and remove worn screen protectors over camera
- Reduce motion blur by stabilizing device
- Use fallback external scanner if needed

### Intermittent "Failed to fetch"

- Confirm backend process is running and listening
- Confirm API URL points to correct host/port
- Check WiFi handoff/dead zones in aisles
- Check firewall or VPN rules blocking API

### Device drains before shift ends

- Reduce brightness where possible
- Add mid-shift charging rotation
- Keep backup power bank or spare device ready

## 11. Hardware Inventory Template

```txt
Store: __________________
Date: ___________________

MOBILE DEVICES
[ ] Device 1: Model __________ Serial __________
[ ] Device 2: Model __________ Serial __________
[ ] Device 3: Model __________ Serial __________

ACCESSORIES
[ ] Rugged cases qty _____
[ ] Cart mounts qty _____
[ ] Charging dock bays _____
[ ] Spare power banks qty _____
[ ] External scanners qty _____

NETWORK
[ ] AP 1 location __________
[ ] AP 2 location __________
[ ] Signal verified in picking aisles

BACKEND
[ ] Host type: local server / cloud VM
[ ] CPU/RAM: __________
[ ] PostgreSQL backup configured
```

## 12. Related Docs

- BACKEND_SETUP.md
- backend/README.md
- frontend/README.md
