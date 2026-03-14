const express = require('express');
const router = express.Router();
const {
  getPickPaths,
  getPickPath,
  generatePickPath,
  generateAllPickPaths,
  generateLinkedListPath,
  generateAIPickPath,
  createPickPath,
  updatePickPath,
  deletePickPath,
  activatePickPath
} = require('../controllers/pickPathController');
const { protect, restrictTo } = require('../middleware/auth');

// Unauthenticated CRUD routes (current app flow has no auth)
router.get('/store/:storeId', getPickPaths);
router.get('/store/:storeId/linked-list', generateLinkedListPath);
router.post('/', createPickPath);
router.get('/:id', getPickPath);
router.put('/:id', updatePickPath);
router.delete('/:id', deletePickPath);

// Protected AI generation routes
router.use(protect);
router.post('/generate', restrictTo('manager'), generatePickPath);
router.post('/generate/all', restrictTo('manager'), generateAllPickPaths);
router.post('/generate/ai', restrictTo('manager'), generateAIPickPath);
router.put('/:id/activate', restrictTo('manager'), activatePickPath);

module.exports = router;
