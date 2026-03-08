const { body, validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      message: 'Validation failed',
      errors: errors.array() 
    });
  }
  next();
};

/**
 * Password validation rules with minimum character limits
 */
const passwordValidation = () => {
  const minLength = parseInt(process.env.MIN_PASSWORD_LENGTH) || 8;
  
  return [
    body('password')
      .isLength({ min: minLength })
      .withMessage(`Password must be at least ${minLength} characters long`)
      .matches(/[A-Z]/)
      .withMessage('Password must contain at least one uppercase letter')
      .matches(/[a-z]/)
      .withMessage('Password must contain at least one lowercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain at least one number')
      .matches(/[!@#$%^&*(),.?":{}|<>]/)
      .withMessage('Password must contain at least one special character')
  ];
};

/**
 * Login validation rules
 */
const loginValidation = () => {
  return [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ];
};

/**
 * Registration validation rules for employees
 */
const employeeRegistrationValidation = () => {
  return [
    body('employeeId')
      .notEmpty()
      .withMessage('Employee ID is required')
      .isAlphanumeric()
      .withMessage('Employee ID must be alphanumeric'),
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ min: 2 })
      .withMessage('First name must be at least 2 characters long'),
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ min: 2 })
      .withMessage('Last name must be at least 2 characters long'),
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    ...passwordValidation(),
    body('role')
      .optional()
      .isIn(['manager', 'picker', 'stager', 'dispenser'])
      .withMessage('Invalid role'),
    body('storeId')
      .isInt({ min: 1 })
      .withMessage('Valid store ID is required')
  ];
};

/**
 * Registration validation rules for customers
 */
const customerRegistrationValidation = () => {
  return [
    body('customerId')
      .notEmpty()
      .withMessage('Customer ID is required')
      .isAlphanumeric()
      .withMessage('Customer ID must be alphanumeric'),
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ min: 2 })
      .withMessage('First name must be at least 2 characters long'),
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ min: 2 })
      .withMessage('Last name must be at least 2 characters long'),
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    ...passwordValidation(),
    body('phone')
      .isMobilePhone()
      .withMessage('Please provide a valid phone number')
  ];
};

/**
 * Order creation validation
 */
const orderValidation = () => {
  return [
    body('customerId')
      .isInt({ min: 1 })
      .withMessage('Valid customer ID is required'),
    body('storeId')
      .isInt({ min: 1 })
      .withMessage('Valid store ID is required'),
    body('scheduledPickupTime')
      .isISO8601()
      .withMessage('Valid pickup time is required')
      .custom((value) => {
        const pickupTime = new Date(value);
        const now = new Date();
        if (pickupTime <= now) {
          throw new Error('Pickup time must be in the future');
        }
        return true;
      }),
    body('items')
      .isArray({ min: 1 })
      .withMessage('Order must contain at least one item'),
    body('items.*.itemId')
      .isInt({ min: 1 })
      .withMessage('Valid item ID is required'),
    body('items.*.quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be at least 1')
  ];
};

/**
 * Item creation/update validation
 */
const itemValidation = () => {
  return [
    body('upc')
      .notEmpty()
      .withMessage('UPC is required')
      .isLength({ min: 8, max: 14 })
      .withMessage('UPC must be between 8 and 14 characters'),
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Item name is required')
      .isLength({ min: 2 })
      .withMessage('Item name must be at least 2 characters long'),
    body('category')
      .notEmpty()
      .withMessage('Category is required'),
    body('department')
      .notEmpty()
      .withMessage('Department is required'),
    body('price')
      .isDecimal({ decimal_digits: '0,2' })
      .withMessage('Valid price is required'),
    body('temperature')
      .optional()
      .isIn(['ambient', 'chilled', 'frozen', 'hot'])
      .withMessage('Invalid temperature type'),
    body('commodity')
      .optional()
      .isIn(['ambient', 'chilled', 'frozen', 'hot', 'oversized', 'restricted'])
      .withMessage('Invalid commodity type')
  ];
};

module.exports = {
  handleValidationErrors,
  passwordValidation,
  loginValidation,
  employeeRegistrationValidation,
  customerRegistrationValidation,
  orderValidation,
  itemValidation
};
