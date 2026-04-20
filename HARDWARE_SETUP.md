# Grocer-E Hardware Setup & Physical Accessories Guide

## 🖥️ System Requirements

### Minimum Hardware Specifications
- **CPU**: Intel Core i5 or equivalent (2.4 GHz or higher)
- **RAM**: 8 GB minimum
- **Storage**: 256 GB SSD
- **Network**: WiFi 5 (802.11ac) or Ethernet (100 Mbps+)
- **Display**: 7" minimum (tablets/mobile devices acceptable)

### Recommended Hardware
- **CPU**: Intel Core i7 or AMD Ryzen 7
- **RAM**: 16 GB
- **Storage**: 512 GB SSD
- **Network**: WiFi 6 (802.11ax) or Gigabit Ethernet
- **Display**: 10"+ touchscreen for optimal ergonomics

---

## 📱 Mobile & Handheld Devices

### Supported Platforms
- **iOS**: 13.0 or later (iPhone 8+, iPad Air 2+)
- **Android**: 9 (API 28) or later

### Required Permissions
The app requests and requires these device permissions:

| Permission | Purpose | Mobile | Tablet |
|-----------|---------|--------|--------|
| **Camera** | Barcode/UPC scanning during picking | ✓ | ✓ |
| **Microphone** | (Optional) Voice commands future feature | — | — |
| **Storage** | Offline sync and caching | ✓ | ✓ |
| **Network** | API communication with backend | ✓ | ✓ |

### Camera Hardware Compatibility

#### Barcode Detection APIs Supported
The application uses two barcode detection technologies:

1. **Native BarcodeDetector API** (Preferred)
   - Built into modern browsers (Chrome 81+, Edge 81+)
   - No additional installation required
   - Supported formats:
     - UPC-A (standard retail barcodes)
     - UPC-E (compressed UPC)
     - EAN-13 (European barcodes)
     - EAN-8 (European compact)
     - Code 128 (logistics, warehouse)
     - Code 39 (industrial use)
     - QR Codes (future features)

2. **ZXing.js Library** (Fallback)
   - Provides broader device compatibility
   - Used when native API unavailable
   - Same barcode format support
   - Slightly slower processing (~50-100ms)

#### Recommended Camera Devices
- **1080p minimum** resolution (1920×1080)
- **Auto-focus** capability essential for varying distances
- **60 FPS minimum** frame rate for smooth detection
- **Wide angle lens** (80°+) to capture barcodes from different angles

##### Device Examples
| Device | Camera | Auto-focus | FPS | Notes |
|--------|--------|-----------|-----|-------|
| iPhone 11/12+ | 12MP wide | Yes | 30+ | Excellent for scanning |
| Samsung Galaxy S10+ | 16MP wide | Yes | 30+ | Good performance |
| iPad Pro (2020+) | 12MP wide | Yes | 30+ | Ideal for tablets |
| Google Pixel 5+ | 12.2MP | Yes | 30+ | Fast processing |

---

## 🏪 Store Hardware Setup

### Central Backend Server
- **Processor**: Multi-core (8+ cores recommended)
- **RAM**: 32 GB minimum
- **Storage**: 1 TB SSD (for database and logs)
- **Networking**: 1 Gbps Ethernet connection
- **Power**: UPS with 2+ hour backup
- **OS**: Linux (Ubuntu 20.04 LTS+) or Windows Server 2019+

### Database Server (PostgreSQL)
- **Dedicated hardware** recommended for stores with 100+ daily orders
- **16 GB+ RAM** for query caching
- **Fast I/O** (NVMe SSD or RAID-configured drives)
- **Backup solution**: Daily automated backups to external storage

### Network Infrastructure
- **WiFi 6 (802.11ax)** access points:
  - One per 1500-2000 sq ft of warehouse
  - Minimum 100 Mbps throughput per device
  - Minimum 50 Mbps upload speed
  - 5 GHz band preferred for stability

- **Wired Ethernet** (preferred for stationary devices):
  - Backroom/staging area servers
  - Check-in kiosks
  - Manager stations

### Environmental Conditions
- **Temperature**: 60-75°F (15-24°C)
- **Humidity**: 30-60% relative humidity
- **Lighting**: Adequate lighting for barcode scanning (500+ lux recommended)

---

## 🔧 Scanner Devices & Accessories

### Handheld Barcode Scanners
Used for manual item entry and fallback when camera scanning unavailable.

#### Recommended Models
| Model | Type | Price | Best For |
|-------|------|-------|----------|
| Symbol LS2208 | 1D Laser | ~$100 | Budget option |
| Honeywell Voyager 1602 | 2D Imager | ~$200 | Excellent range |
| Zebra DS3678 | 2D Industrial | ~$400 | Rugged use |
| Datalogic Gryphon | 2D Presentation | ~$300 | Checkout-style |

#### Connection Types
- **USB Wired**: Direct connection (most reliable)
- **Bluetooth**: 30-50 ft range, easier mobility
- **2.4 GHz Wireless**: Medium reliability, good range

### Mobile Device Mounting
- **Adjustable tablet holders** for stationary work (picking carts)
- **Arm-mounted brackets** for hands-free operation
- **Lanyard/harness systems** for personal carry during walking
- **Anti-drop cases** with reinforced corners

#### Recommended Mounting Solutions
- RAM Mounts (adjustable, durable)
- Manfrotto grips (professional-grade)
- Vehicle/cart-specific mounts
- Protective cases with raised bezels

---

## 🎯 Optimal Setup Configurations

### Small Store (< 50 daily orders)
- **1-2 tablets** (10" iPad or Android tablet)
- **1 WiFi 5 router** (central location)
- **Backup barcode scanner** (USB connected)
- **Server**: Can run on single modest machine or cloud instance

### Medium Store (50-500 daily orders)
- **3-4 tablets/mobile devices** (mixed iPhone/Android)
- **2-3 WiFi 6 access points** (distributed)
- **3-4 stationary barcode scanners** (Bluetooth)
- **Dedicated backend server** (8-core, 16 GB RAM)
- **Database server** (PostgreSQL on separate hardware)

### Large Store (500+ daily orders)
- **6-10 dedicated handheld devices**
- **Comprehensive WiFi 6 mesh network** (coverage throughout store)
- **Redundant network connections** (multiple ISPs)
- **High-performance backend** (16+ core, 64 GB RAM)
- **Enterprise database setup** (replicated, backed up)
- **Load balancer** for multiple backend instances
- **Redundant UPS systems** (zero downtime)

---

## 🚀 Setup Checklist

### Pre-Deployment
- [ ] Test camera permissions on all intended devices
- [ ] Verify WiFi signal strength throughout store (minimum -70 dBm)
- [ ] Confirm barcode scanner compatibility with iOS/Android
- [ ] Establish backup internet connection plan
- [ ] Configure mobile device MDM (Mobile Device Management) for enterprise

### Deployment Day
- [ ] Install and configure backend server
- [ ] Set up PostgreSQL database with backups
- [ ] Configure WiFi network and test coverage
- [ ] Test barcode scanning on all planned devices
- [ ] Verify camera permissions on all test devices
- [ ] Conduct full picking workflow test with live users
- [ ] Train employees on device use and scanning techniques

### Post-Deployment
- [ ] Monitor network performance and latency
- [ ] Collect feedback on camera/scanner reliability
- [ ] Document any device-specific issues
- [ ] Schedule weekly network performance reviews
- [ ] Establish device maintenance schedule

---

## 🎥 Camera Operation Best Practices

### Optimal Scanning Technique
1. **Distance**: Hold device 4-12 inches from barcode
2. **Angle**: Keep barcode parallel to camera lens
3. **Lighting**: Ensure adequate ambient lighting (avoid glare)
4. **Stability**: Hold device steady for 1-2 seconds
5. **Feedback**: Listen for scan confirmation sound/vibration

### Troubleshooting Camera Issues

| Issue | Solution |
|-------|----------|
| Barcode not detecting | Clean camera lens; increase lighting; ensure barcode visible |
| Slow detection | Reduce background motion; improve lighting; update app |
| Permission errors | Go to Settings > App Permissions > enable Camera |
| Focus issues | Ensure device auto-focus enabled; not too close to barcode |

---

## 🔌 Power & Charging

### Device Charging Strategy
- **Quick-charge capable chargers** (30W+) for tablets
- **Charging dock stations** in backroom (4-8 device capacity)
- **Battery packs** (20,000 mAh+) for extended picking walks
- **Wireless charging pads** for convenience

### Power Consumption
- Tablet (continuous use): 15-20W
- Mobile phone: 5-10W
- WiFi router: 10-15W
- Backend server: 200-400W

### Typical Battery Life
- iPad (full brightness, camera active): 6-8 hours
- Android tablet: 8-10 hours
- Mobile phone: 4-6 hours (with active scanning)

---

## 🛡️ Security Considerations

### Network Security
- Enable WPA3 encryption on WiFi network
- Isolate backend server on secure subnet
- Use VPN for remote access
- Implement firewall rules restricting access

### Device Security
- Enable device lock screens (biometric/PIN)
- Install mobile device management (MDM) for corporate devices
- Regular security updates (weekly recommended)
- Disable non-essential features (Bluetooth when not needed)

### Data Protection
- All API communication uses HTTPS/TLS encryption
- JWT tokens expire after 30 minutes (configurable)
- Local data cached only while employee logged in
- Automatic logout on app background (5 minute idle)

---

## 📊 Performance Monitoring

### Key Metrics to Track
- **Network latency**: Target < 100ms to backend
- **Camera detection speed**: Target < 500ms per scan
- **WiFi signal strength**: Minimum -70 dBm throughout store
- **Device battery**: Monitor hourly usage patterns
- **API response time**: Target < 200ms for order retrieval

### Monitoring Tools
- Built-in app diagnostics (shown in settings)
- Network analyzer apps (WiFi Analyzer, NetSpot)
- Server monitoring dashboard (Grafana/Prometheus)
- Database performance monitoring (pgAdmin for PostgreSQL)

---

## 🆘 Support & Troubleshooting

### Common Issues

**"Camera permission denied"**
- Navigate to device Settings > App Permissions
- Ensure camera permission set to "Allow"
- Restart app after granting permission

**"WiFi connection drops"**
- Move closer to router
- Check for interference (microwaves, cordless phones)
- Reboot router and device
- Contact IT for signal strength analysis

**"Barcode won't scan"**
- Ensure adequate lighting (avoid direct sunlight)
- Clean camera lens with soft cloth
- Verify barcode is not damaged
- Try alternate scanner if available

**"Slow app performance"**
- Check WiFi signal strength
- Restart device (clears cache)
- Check available device storage (need 500MB+ free)
- Restart backend server if API calls slow

### Support Contact
For hardware-specific issues:
- Email: tech-support@grocere.local
- Phone: 1-800-GROCERE
- Hours: Monday-Friday, 8 AM - 5 PM EST

---

## 📋 Hardware Inventory Template

```
Store: _________________
Date: __________________

MOBILE DEVICES
[ ] Device 1: Brand/Model: __________ Serial: __________
[ ] Device 2: Brand/Model: __________ Serial: __________

SCANNERS
[ ] Scanner 1: Type: __________ Connection: __________
[ ] Scanner 2: Type: __________ Connection: __________

NETWORK
[ ] Router 1: Model: __________ Location: __________
[ ] Router 2: Model: __________ Location: __________

SERVERS
[ ] Backend: CPU/RAM: __________ OS: __________
[ ] Database: Storage: __________ Backup: __________

ACCESSORIES
[ ] Mobile mounts: Qty: __________ Locations: __________
[ ] Charging dock: Qty: __________ Location: __________
[ ] Battery packs: Qty: __________ Capacity: __________
```

---

## 📞 Contact & Resources

- **Documentation**: See BACKEND_SETUP.md for server configuration
- **API Docs**: See backend/README.md for detailed API specifications
- **Frontend Setup**: See frontend/README.md for web app installation
- **Support**: Post issues to internal tech support system
