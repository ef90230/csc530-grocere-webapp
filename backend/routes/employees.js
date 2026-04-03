const express = require('express');
const router = express.Router();
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeMetrics,
  getMyAndStoreStats
} = require('../controllers/employeeController');
const { protect, restrictTo } = require('../middleware/auth');
const { employeeRegistrationValidation, handleValidationErrors } = require('../middleware/validation');

router.use(protect);

router.get('/', restrictTo('manager'), getEmployees);

router.post(
  '/',
  restrictTo('manager'),
  employeeRegistrationValidation(),
  handleValidationErrors,
  createEmployee
);

router.get('/stats/summary', getMyAndStoreStats);

router.get('/:id', getEmployee);

router.get('/:id/metrics', getEmployeeMetrics);

router.put('/:id', updateEmployee);

router.delete('/:id', restrictTo('manager'), deleteEmployee);

module.exports = router;
