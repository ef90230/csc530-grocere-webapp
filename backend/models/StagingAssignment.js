const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const StagingAssignment = sequelize.define('StagingAssignment', {
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
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  commodity: {
    type: DataTypes.ENUM('ambient', 'chilled', 'frozen', 'hot', 'oversized'),
    allowNull: false
  },
  stagingLocationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'staging_locations',
      key: 'id'
    }
  }
}, {
  tableName: 'staging_assignments',
  timestamps: true,
  indexes: [
    {
      fields: ['storeId']
    },
    {
      fields: ['stagingLocationId']
    },
    {
      unique: true,
      fields: ['storeId', 'orderId', 'commodity']
    }
  ]
});

module.exports = StagingAssignment;