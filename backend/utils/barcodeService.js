const ENTITY_PREFIXES = {
  cart: '31',
  stagingLocation: '47'
};

const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

const calculateUpcCheckDigit = (payload) => {
  const digits = normalizeDigits(payload).slice(0, 11).padEnd(11, '0');
  const sum = digits.split('').reduce((accumulator, digit, index) => {
    const numeric = Number(digit);
    return accumulator + (index % 2 === 0 ? numeric * 3 : numeric);
  }, 0);

  return String((10 - (sum % 10)) % 10);
};

const generateEntityUpc = (entityType, seed = '') => {
  const prefix = ENTITY_PREFIXES[entityType] || '91';
  const seedDigits = normalizeDigits(seed);
  const entropy = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const payload = `${prefix}${(seedDigits + entropy).padEnd(9, '0').slice(0, 9)}`.slice(0, 11);

  return `${payload}${calculateUpcCheckDigit(payload)}`;
};

module.exports = {
  normalizeDigits,
  calculateUpcCheckDigit,
  generateEntityUpc
};
