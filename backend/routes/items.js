const express = require('express');
const router = express.Router();
const {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getAvailableItems,
  checkItemAvailability,
  updateItemInventory
} = require('../controllers/itemController');
const { protect, restrictTo } = require('../middleware/auth');
const { itemValidation, handleValidationErrors } = require('../middleware/validation');

// Public routes
// @route   GET /api/items
// @desc    Get all items with optional filters
// @access  Public
router.get('/', getItems);

// @route   GET /api/items/store/:storeId/available
// @desc    Get available items at a store
// @access  Public
router.get('/store/:storeId/available', getAvailableItems);

// @route   GET /api/items/:id
// @desc    Get single item
// @access  Public
router.get('/:id', getItem);

// @route   GET /api/items/:id/availability/:storeId
// @desc    Check item availability at a store
// @access  Public
router.get('/:id/availability/:storeId', checkItemAvailability);

// Protected routes (require authentication)
router.use(protect);

// @route   POST /api/items
// @desc    Create new item
// @access  Private (Manager)
router.post(
  '/',
  restrictTo('manager'),
  itemValidation(),
  handleValidationErrors,
  createItem
);

// @route   PUT /api/items/:id
// @desc    Update item
// @access  Private (Manager)
router.put(
  '/:id',
  restrictTo('manager'),
  updateItem
);

// @route   DELETE /api/items/:id
// @desc    Delete item (soft delete)
// @access  Private (Manager)
router.delete('/:id', restrictTo('manager'), deleteItem);

// @route   PUT /api/items/:id/location/:locationId
// @desc    Update item inventory at location
// @access  Private (Manager or Picker)
router.put('/:id/location/:locationId', updateItemInventory);

module.exports = router;
