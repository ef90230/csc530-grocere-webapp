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

router.use(protect);

router.get('/', restrictTo('manager'), getCustomers);

router.get('/checkedin/:storeId', getCheckedInCustomers);

router.get('/:id', getCustomer);

router.put('/:id', updateCustomer);

router.post('/:id/checkin', checkIn);

router.post('/:id/checkout', checkOut);

module.exports = router;
