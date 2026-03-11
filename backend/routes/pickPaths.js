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

router.use(protect);

router.get('/store/:storeId', restrictTo('manager'), getPickPaths);

router.post('/generate', restrictTo('manager'), generatePickPath);

router.post('/generate/all', restrictTo('manager'), generateAllPickPaths);

router.post('/generate/ai', restrictTo('manager'), generateAIPickPath);

router.get('/store/:storeId/linked-list', restrictTo('manager'), generateLinkedListPath);

router.post('/', restrictTo('manager'), createPickPath);

router.get('/:id', getPickPath);

router.put('/:id', restrictTo('manager'), updatePickPath);

router.put('/:id/activate', restrictTo('manager'), activatePickPath);

router.delete('/:id', restrictTo('manager'), deletePickPath);

module.exports = router;
