const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Aisle = sequelize.define('Aisle', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  storeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'stores',
      key: 'id'
    }
  },
  aisleNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  aisleName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  zone: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Zone designation for organizing aisles'
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Primary category of items in this aisle'
  },
  coordinates: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Physical coordinates for mapping'
  }
}, {
  tableName: 'aisles',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['storeId', 'aisleNumber']
    }
  ]
});

module.exports = Aisle;
