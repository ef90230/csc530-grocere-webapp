const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CartItem = sequelize.define('CartItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  cartId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'carts',
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
    defaultValue: 1,
    validate: {
      min: 1
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Customer notes for this item (e.g., special handling, ripeness)'
  }
}, {
  tableName: 'cart_items',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['cartId', 'itemId']
    }
  ]
});

module.exports = CartItem;
