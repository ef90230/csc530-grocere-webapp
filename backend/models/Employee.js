const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const bcrypt = require('bcryptjs');

const Employee = sequelize.define('Employee', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  employeeId: {
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
  role: {
    type: DataTypes.ENUM('manager', 'picker', 'stager', 'dispenser'),
    defaultValue: 'picker'
  },
  storeId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  pickRate: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  firstTimePickPercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  preSubstitutionPercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  postSubstitutionPercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  onTimePercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  weightedEfficiency: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  }
}, {
  tableName: 'employees',
  timestamps: true
});
Employee.beforeCreate(async (employee) => {
  if (employee.password) {
    const salt = await bcrypt.genSalt(10);
    employee.password = await bcrypt.hash(employee.password, salt);
  }
});

Employee.beforeUpdate(async (employee) => {
  if (employee.changed('password')) {
    const salt = await bcrypt.genSalt(10);
    employee.password = await bcrypt.hash(employee.password, salt);
  }
});
Employee.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = Employee;
