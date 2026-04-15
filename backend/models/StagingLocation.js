const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { generateEntityUpc } = require('../utils/barcodeService');

const StagingLocation = sequelize.define('StagingLocation', {
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
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  itemType: {
    type: DataTypes.ENUM('ambient', 'chilled', 'frozen', 'hot', 'oversized'),
    allowNull: false
  },
  locationCode: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 120]
    }
  },
  stagingLimit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
    validate: {
      min: 1,
      max: 50,
      isInt: true
    }
  },
  upc: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Generated barcode for tote location identification'
  }
}, {
  tableName: 'staging_locations',
  timestamps: true,
  indexes: [
    {
      fields: ['storeId']
    },
    {
      unique: true,
      fields: ['storeId', 'name']
    },
    {
      fields: ['itemType']
    }
  ]
});

StagingLocation.beforeValidate((location) => {
  if (!location.upc) {
    location.upc = generateEntityUpc('stagingLocation', location.id);
  }
});

module.exports = StagingLocation;