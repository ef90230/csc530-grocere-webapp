const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { generateEntityUpc } = require('../utils/barcodeService');

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
  },
  upc: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Generated barcode for tote/cart identification'
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

Cart.beforeValidate((cart) => {
  if (!cart.upc) {
    cart.upc = generateEntityUpc('cart', cart.id);
  }
});

module.exports = Cart;
