const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const bcrypt = require('bcryptjs');

const Customer = sequelize.define('Customer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  customerId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  },
  vehicleInfo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  parkingSpot: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isCheckedIn: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  checkInTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  preferredStoreId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'customers',
  timestamps: true
});
Customer.beforeCreate(async (customer) => {
  if (customer.password) {
    const salt = await bcrypt.genSalt(10);
    customer.password = await bcrypt.hash(customer.password, salt);
  }
});

Customer.beforeUpdate(async (customer) => {
  if (customer.changed('password')) {
    const salt = await bcrypt.genSalt(10);
    customer.password = await bcrypt.hash(customer.password, salt);
  }
});
Customer.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = Customer;
