const express = require('express');
const router = express.Router();
const {
  getCustomers,
  getCustomer,
  updateCustomer,
  checkIn,
  checkOut,
  getCheckedInCustomers
} = require('../controllers/customerController');
const { protect, restrictTo } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// @route   GET /api/customers
// @desc    Get all customers
// @access  Private (Manager)
router.get('/', restrictTo('manager'), getCustomers);

// @route   GET /api/customers/checkedin/:storeId
// @desc    Get checked-in customers at a store
// @access  Private (Employee)
router.get('/checkedin/:storeId', getCheckedInCustomers);

// @route   GET /api/customers/:id
// @desc    Get single customer
// @access  Private
router.get('/:id', getCustomer);

// @route   PUT /api/customers/:id
// @desc    Update customer
// @access  Private (Self or Manager)
router.put('/:id', updateCustomer);

// @route   POST /api/customers/:id/checkin
// @desc    Check in customer for pickup
// @access  Private (Customer)
router.post('/:id/checkin', checkIn);

// @route   POST /api/customers/:id/checkout
// @desc    Check out customer after pickup
// @access  Private (Employee or Customer)
router.post('/:id/checkout', checkOut);

module.exports = router;
