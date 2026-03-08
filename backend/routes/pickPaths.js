const express = require('express');
const router = express.Router();
const {
  getPickPaths,
  getPickPath,
  generatePickPath,
  generateAllPickPaths,
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

router.post('/', restrictTo('manager'), createPickPath);

router.get('/:id', getPickPath);

router.put('/:id', restrictTo('manager'), updatePickPath);

router.put('/:id/activate', restrictTo('manager'), activatePickPath);

router.delete('/:id', restrictTo('manager'), deletePickPath);

module.exports = router;
