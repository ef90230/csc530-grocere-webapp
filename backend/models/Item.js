const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');

const isValidUpcA = (digits) => {
  if (!/^\d{12}$/.test(digits)) {
    return false;
  }

  const checkDigit = Number(digits[11]);
  let sum = 0;

  for (let index = 0; index < 11; index += 1) {
    const digit = Number(digits[index]);
    sum += index % 2 === 0 ? digit * 3 : digit;
  }

  return ((10 - (sum % 10)) % 10) === checkDigit;
};

const convertUpcEtoUpcA = (upcE) => {
  if (!/^\d{8}$/.test(upcE)) {
    return null;
  }

  const numberSystem = upcE[0];
  const checkDigit = upcE[7];
  const d1 = upcE[1];
  const d2 = upcE[2];
  const d3 = upcE[3];
  const d4 = upcE[4];
  const d5 = upcE[5];
  const d6 = upcE[6];

  let upcABody;
  if (d6 === '0' || d6 === '1' || d6 === '2') {
    upcABody = `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  } else if (d6 === '3') {
    upcABody = `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}`;
  } else if (d6 === '4') {
    upcABody = `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}`;
  } else {
    upcABody = `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }

  return `${upcABody}${checkDigit}`;
};

const isLegalUpc = (value = '') => {
  const digits = normalizeDigits(value);

  if (digits.length === 12) {
    return isValidUpcA(digits);
  }

  if (digits.length === 8) {
    const expanded = convertUpcEtoUpcA(digits);
    return Boolean(expanded && isValidUpcA(expanded));
  }

  if (digits.length === 13 && digits.startsWith('0')) {
    return isValidUpcA(digits.slice(1));
  }

  if (digits.length === 14 && digits.startsWith('00')) {
    return isValidUpcA(digits.slice(2));
  }

  return false;
};

const Item = sequelize.define('Item', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  upc: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isLegalUpcValue(value) {
        if (!isLegalUpc(value)) {
          throw new Error('This is not a valid UPC code. Please try again or look up manually with the search bar.');
        }
      }
    }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  department: {
    type: DataTypes.STRING,
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
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
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Weight in pounds'
  },
  unassignedQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'unassignedquantity'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'items',
  timestamps: true,
  indexes: [
    {
      fields: ['name']
    },
    {
      fields: ['category']
    },
    {
      fields: ['department']
    },
    {
      fields: ['commodity']
    }
  ]
});

module.exports = Item;
