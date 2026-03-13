const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/db');
const { syncDatabase } = require('./models');
const { initializeSchedulingMaintenance } = require('./utils/schedulingMaintenance');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Grocer-E API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      employees: '/api/employees',
      customers: '/api/customers',
      items: '/api/items',
      aisles: '/api/aisles',
      cart: '/api/cart',
      orders: '/api/orders',
      pickPaths: '/api/pickpaths'
    }
  });
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
    
    app.listen(PORT, () => {
      console.log(`\nServer running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`API URL: http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
