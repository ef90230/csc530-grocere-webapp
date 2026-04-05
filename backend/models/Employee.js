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
    defaultValue: 0.00,
    validate: {
      min: 0
    }
  },
  itemsPicked: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  firstTimePickPercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100
    }
  },
  preSubstitutionPercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100
    }
  },
  postSubstitutionPercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100
    }
  },
  percentNotFound: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100
    }
  },
  onTimePercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100
    }
  },
  weightedEfficiency: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0
    }
  },
  totesStaged: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  }
}, {
  tableName: 'employees',
  timestamps: true,
  validate: {
    preSubstitutionNotGreaterThanPostSubstitution() {
      if (this.preSubstitutionPercent > this.postSubstitutionPercent) {
        throw new Error('preSubstitutionPercent cannot be greater than postSubstitutionPercent');
      }
    }
  }
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
