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

router.get('/', getItems);

router.get('/store/:storeId/available', getAvailableItems);

router.get('/:id', getItem);

router.get('/:id/availability/:storeId', checkItemAvailability);

router.use(protect);

router.post(
  '/',
  restrictTo('manager'),
  itemValidation(),
  handleValidationErrors,
  createItem
);

router.put(
  '/:id',
  restrictTo('manager'),
  updateItem
);

router.delete('/:id', restrictTo('manager'), deleteItem);

router.put('/:id/location/:locationId', updateItemInventory);

module.exports = router;
