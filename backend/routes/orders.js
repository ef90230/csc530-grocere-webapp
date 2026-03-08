const express = require('express');
const router = express.Router();
const {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  updateOrderItem,
  getOrdersForPicking,
  cancelOrder
} = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/auth');
const { orderValidation, handleValidationErrors } = require('../middleware/validation');

router.use(protect);

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
