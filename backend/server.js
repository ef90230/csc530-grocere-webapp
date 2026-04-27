const express = require('express');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./config/db');
const { syncDatabase } = require('./models');
const { initializeSchedulingMaintenance } = require('./utils/schedulingMaintenance');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const resolveSslFile = (explicitPath, fallbackRelativePath) => {
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const fallbackPath = path.join(__dirname, fallbackRelativePath);
  return fs.existsSync(fallbackPath) ? fallbackPath : null;
};

const sslKeyPath = resolveSslFile(process.env.SSL_KEY_FILE, 'certs/server-key.pem');
const sslCertPath = resolveSslFile(process.env.SSL_CERT_FILE, 'certs/server-cert.pem');
const runningInRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_STATIC_URL
);
const useHttps = !runningInRailway && Boolean(sslKeyPath && sslCertPath);

// Serve frontend static files from the build directory
const frontendBuildPath = path.join(__dirname, '../frontend/build');
app.use(express.static(frontendBuildPath));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Compatibility shim: normalize accidental double API prefixes from older builds.
app.use((req, res, next) => {
  if (req.url.startsWith('/api/api/')) {
    req.url = req.url.replace('/api/api/', '/api/');
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/items', require('./routes/items'));
app.use('/api/aisles', require('./routes/aisles'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/pickpaths', require('./routes/pickPaths'));
app.use('/api/staging-locations', require('./routes/stagingLocations'));
app.use('/api/alerts', require('./routes/alerts'));

// Serve React app for all non-API routes (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await testConnection();
    await syncDatabase(false);
    initializeSchedulingMaintenance();

    const server = useHttps
      ? https.createServer(
          {
            key: fs.readFileSync(sslKeyPath),
            cert: fs.readFileSync(sslCertPath)
          },
          app
        )
      : http.createServer(app);
    
    server.listen(PORT, () => {
      const protocol = useHttps ? 'https' : 'http';
      console.log(`\nServer running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`API URL: ${protocol}://localhost:${PORT}`);
      console.log(`Health check: ${protocol}://localhost:${PORT}/health`);
      if (useHttps) {
        console.log(`HTTPS enabled with cert: ${sslCertPath}`);
      } else if (runningInRailway) {
        console.log('Railway environment detected. HTTPS is disabled inside the container (Railway terminates TLS at the edge).');
      } else {
        console.log('HTTPS disabled. Set SSL_KEY_FILE and SSL_CERT_FILE or add backend/certs/server-key.pem and backend/certs/server-cert.pem to enable it.');
      }
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
