const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Cart = sequelize.define('Cart', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
    allowNull: true,
    references: {
      model: 'stores',
      key: 'id'
    },
    comment: 'Store where customer intends to fulfill this order'
  }
}, {
  tableName: 'carts',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['customerId']
    }
  ]
});

module.exports = Cart;
