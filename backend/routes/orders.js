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

// All routes require authentication
router.use(protect);

// @route   GET /api/orders
// @desc    Get all orders with filters
// @access  Private
router.get('/', getOrders);

// @route   GET /api/orders/picking/:storeId
// @desc    Get orders grouped by commodity for picking
// @access  Private (Picker)
router.get('/picking/:storeId', getOrdersForPicking);

// @route   POST /api/orders
// @desc    Create new order
// @access  Private (Customer)
router.post(
  '/',
  orderValidation(),
  handleValidationErrors,
  createOrder
);

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private
router.get('/:id', getOrder);

// @route   PUT /api/orders/:id/status
// @desc    Update order status
// @access  Private (Employee)
router.put('/:id/status', updateOrderStatus);

// @route   PUT /api/orders/:id/items/:itemId
// @desc    Update order item status
// @access  Private (Picker)
router.put('/:id/items/:itemId', updateOrderItem);

// @route   DELETE /api/orders/:id
// @desc    Cancel order
// @access  Private (Customer or Manager)
router.delete('/:id', cancelOrder);

module.exports = router;
