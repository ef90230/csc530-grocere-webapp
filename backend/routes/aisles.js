const express = require('express');
const router = express.Router();
const {
  getAisles,
  getAisle,
  updateAisle,
  batchUpdateAisles
} = require('../controllers/aisleController');
const { protect, restrictTo } = require('../middleware/auth');

// Public GET routes
router.get('/store/:storeId', getAisles);
router.get('/:id', getAisle);

// Protected routes below this
router.use(protect);

// Batch update multiple aisles (for saving map layout, managers only)
router.post(
  '/batch/update',
  restrictTo('manager'),
  batchUpdateAisles
);

// Update a single aisle (managers only)
router.put(
  '/:id',
  restrictTo('manager'),
  updateAisle
);

module.exports = router;

