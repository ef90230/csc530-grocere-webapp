const express = require('express');
const router = express.Router();
const {
  login,
  registerEmployee,
  registerAdmin,
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

router.post(
  '/login',
  loginValidation(),
  handleValidationErrors,
  login
);

router.post(
  '/register/employee',
  employeeRegistrationValidation(),
  handleValidationErrors,
  registerEmployee
);

router.post(
  '/register/admin',
  employeeRegistrationValidation(),
  handleValidationErrors,
  registerAdmin
);

router.post(
  '/register/customer',
  customerRegistrationValidation(),
  handleValidationErrors,
  registerCustomer
);

router.get('/me', protect, getMe);

module.exports = router;
