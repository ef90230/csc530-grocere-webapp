const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const StagingLocationSetting = sequelize.define('StagingLocationSetting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  storeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'stores',
      key: 'id'
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
  }
}, {
  tableName: 'staging_location_settings',
  timestamps: true
});

module.exports = StagingLocationSetting;