const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Location = sequelize.define('Location', {
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
  aisleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'aisles',
      key: 'id'
    }
  },
  section: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Section within aisle (e.g., A1, B2)'
  },
  shelf: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  temperature: {
    type: DataTypes.ENUM('ambient', 'chilled', 'frozen', 'hot'),
    allowNull: false,
    defaultValue: 'ambient'
  },
  commodity: {
    type: DataTypes.ENUM('ambient', 'chilled', 'frozen', 'hot', 'oversized', 'restricted'),
    allowNull: false,
    defaultValue: 'ambient'
  },
  coordinates: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Precise coordinates for navigation'
  }
}, {
  tableName: 'locations',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['storeId', 'aisleId', 'section']
    }
  ]
});

module.exports = Location;
