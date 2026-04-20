const express = require('express');
const router = express.Router();
const {
  getAisles,
  getAisle,
  createAisle,
  addAisleSection,
  updateAisleSection,
  deleteAisleSection,
  getAisleSectionItems,
  deleteAisle,
  updateAisle,
  batchUpdateAisles
} = require('../controllers/aisleController');

// Public GET routes
router.get('/store/:storeId', getAisles);
router.get('/sections/:locationId/items', getAisleSectionItems);
router.get('/:id', getAisle);

// Aisle mutation routes for layout editing
router.post('/', createAisle);
router.post('/:id/sections', addAisleSection);
router.post('/batch/update', batchUpdateAisles);
router.put('/batch/update', batchUpdateAisles);
router.put('/sections/:locationId', updateAisleSection);
router.put('/:id', updateAisle);
router.delete('/sections/:locationId', deleteAisleSection);
router.delete('/:id', deleteAisle);

module.exports = router;

