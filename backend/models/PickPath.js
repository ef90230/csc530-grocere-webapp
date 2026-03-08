const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PickPath = sequelize.define('PickPath', {
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
  commodity: {
    type: DataTypes.ENUM('ambient', 'chilled', 'frozen', 'hot', 'oversized', 'restricted'),
    allowNull: false
  },
  pathName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  pathSequence: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Ordered array of location IDs representing the pick path'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isAiGenerated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  efficiencyScore: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Calculated efficiency score for this path'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'employees',
      key: 'id'
    }
  }
}, {
  tableName: 'pick_paths',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['storeId', 'commodity', 'pathName']
    }
  ]
});

module.exports = PickPath;
