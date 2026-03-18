const express = require('express');
const router = express.Router();
const {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  updateOrderItem,
  getOrdersForPicking,
  cancelOrder,
  getAvailableScheduleSlots,
  getNextAvailableSlotForStore,
  validateOrderScheduleTime,
  triggerSchedulePurge
} = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/auth');
const { orderValidation, handleValidationErrors } = require('../middleware/validation');

router.use(protect);

// Scheduling endpoints
router.get('/scheduling/slots/:storeId', getAvailableScheduleSlots);
router.get('/scheduling/next/:storeId', getNextAvailableSlotForStore);
router.post('/scheduling/validate/:storeId', validateOrderScheduleTime);
router.post('/scheduling/purge', restrictTo('manager'), triggerSchedulePurge);

router.get('/', getOrders);

router.get('/picking/:storeId', getOrdersForPicking);

router.post(
  '/',
  orderValidation(),
  handleValidationErrors,
  createOrder
);

router.get('/:id', getOrder);

router.put('/:id/status', updateOrderStatus);

router.put('/:id/items/:itemId', updateOrderItem);

router.delete('/:id', cancelOrder);

module.exports = router;
