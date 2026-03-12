const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Timeslot = sequelize.define('Timeslot', {
  orderNumber: {
    type: DataTypes.STRING,
    primaryKey: true,
    unique: true,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'orderNumber'
    }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  items: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'order_items',
      key: 'id'
    }
  }
}, {
  tableName: 'timeslots',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['orderNumber']
    },
    {
      fields: ['items']
    }
  ]
});

module.exports = Timeslot;
