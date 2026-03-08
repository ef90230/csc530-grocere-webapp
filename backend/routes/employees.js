const express = require('express');
const router = express.Router();
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeMetrics
} = require('../controllers/employeeController');
const { protect, restrictTo } = require('../middleware/auth');
const { employeeRegistrationValidation, handleValidationErrors } = require('../middleware/validation');

// All routes require authentication
router.use(protect);

// @route   GET /api/employees
// @desc    Get all employees
// @access  Private (Manager)
router.get('/', restrictTo('manager'), getEmployees);

// @route   POST /api/employees
// @desc    Create new employee
// @access  Private (Manager)
router.post(
  '/',
  restrictTo('manager'),
  employeeRegistrationValidation(),
  handleValidationErrors,
  createEmployee
);

// @route   GET /api/employees/:id
// @desc    Get single employee
// @access  Private
router.get('/:id', getEmployee);

// @route   GET /api/employees/:id/metrics
// @desc    Get employee performance metrics
// @access  Private
router.get('/:id/metrics', getEmployeeMetrics);

// @route   PUT /api/employees/:id
// @desc    Update employee
// @access  Private (Manager or self)
router.put('/:id', updateEmployee);

// @route   DELETE /api/employees/:id
// @desc    Delete employee (soft delete)
// @access  Private (Manager)
router.delete('/:id', restrictTo('manager'), deleteEmployee);

module.exports = router;
