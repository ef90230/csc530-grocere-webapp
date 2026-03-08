const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ItemLocation = sequelize.define('ItemLocation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  itemId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'items',
      key: 'id'
    }
  },
  locationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'locations',
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
  quantityOnHand: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  isPrimaryLocation: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this is the primary location for this item'
  },
  lastRestockedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'item_locations',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['itemId', 'locationId', 'storeId']
    },
    {
      fields: ['storeId', 'quantityOnHand']
    }
  ]
});

module.exports = ItemLocation;
