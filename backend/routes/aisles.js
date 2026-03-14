const express = require('express');
const router = express.Router();
const {
  getAisles,
  getAisle,
  createAisle,
  updateAisle,
  batchUpdateAisles
} = require('../controllers/aisleController');

// Public GET routes
router.get('/store/:storeId', getAisles);
router.get('/:id', getAisle);

// Aisle mutation routes for layout editing
router.post('/', createAisle);
router.post('/batch/update', batchUpdateAisles);
router.put('/batch/update', batchUpdateAisles);
router.put('/:id', updateAisle);

module.exports = router;

