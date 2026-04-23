const express = require('express');
const router = express.Router();
const {
  login,
  registerEmployee,
  registerAdmin,
  registerCustomer,
  getMe,
  updateMe,
  deleteMe,
  getAdminSlotStatus,
  becomeAdmin
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const {
  loginValidation,
  employeeRegistrationValidation,
  customerRegistrationValidation,
  profileNameValidation,
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
router.put('/me', protect, profileNameValidation(), handleValidationErrors, updateMe);
router.delete('/me', protect, deleteMe);
router.get('/admin-slot', protect, getAdminSlotStatus);
router.post('/become-admin', protect, becomeAdmin);

module.exports = router;
