const express = require('express');
const router = express.Router();
const {
  login,
  registerEmployee,
  registerCustomer,
  getMe
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const {
  loginValidation,
  employeeRegistrationValidation,
  customerRegistrationValidation,
  handleValidationErrors
} = require('../middleware/validation');

// @route   POST /api/auth/login
// @desc    Login user (employee or customer)
// @access  Public
router.post(
  '/login',
  loginValidation(),
  handleValidationErrors,
  login
);

// @route   POST /api/auth/register/employee
// @desc    Register new employee
// @access  Public (should be restricted in production)
router.post(
  '/register/employee',
  employeeRegistrationValidation(),
  handleValidationErrors,
  registerEmployee
);

// @route   POST /api/auth/register/customer
// @desc    Register new customer
// @access  Public
router.post(
  '/register/customer',
  customerRegistrationValidation(),
  handleValidationErrors,
  registerCustomer
);

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, getMe);

module.exports = router;
