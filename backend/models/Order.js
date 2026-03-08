const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  orderNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  storeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'stores',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM(
      'pending',
      'assigned',
      'picking',
      'picked',
      'staging',
      'staged',
      'ready',
      'dispensing',
      'completed',
      'cancelled'
    ),
    defaultValue: 'pending'
  },
  scheduledPickupTime: {
    type: DataTypes.DATE,
    allowNull: false
  },
  actualPickupTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  assignedPickerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'employees',
      key: 'id'
    }
  },
  assignedDispenserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'employees',
      key: 'id'
    }
  },
  pickingStartTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  pickingEndTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  waitTimeMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Wait time in parking lot'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'orders',
  timestamps: true,
  indexes: [
    {
      fields: ['customerId']
    },
    {
      fields: ['storeId']
    },
    {
      fields: ['status']
    },
    {
      fields: ['scheduledPickupTime']
    }
  ]
});

module.exports = Order;
