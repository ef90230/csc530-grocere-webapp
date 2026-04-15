const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const OrderItem = sequelize.define('OrderItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  itemId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'items',
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  unitPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'found', 'substituted', 'out_of_stock', 'skipped', 'canceled'),
    defaultValue: 'pending'
  },
  substitutedItemId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'items',
      key: 'id'
    }
  },
  pickedQuantity: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  attemptCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of scan attempts before found'
  },
  foundOnFirstAttempt: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    comment: 'For FTP metric calculation'
  },
  pickedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'order_items',
  timestamps: true,
  indexes: [
    {
      fields: ['orderId']
    },
    {
      fields: ['itemId']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = OrderItem;
