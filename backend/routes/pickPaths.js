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

// All routes require authentication
router.use(protect);

// @route   GET /api/pickpaths/store/:storeId
// @desc    Get all pick paths for a store
// @access  Private (Manager)
router.get('/store/:storeId', restrictTo('manager'), getPickPaths);

// @route   POST /api/pickpaths/generate
// @desc    Generate AI-optimized pick path
// @access  Private (Manager)
router.post('/generate', restrictTo('manager'), generatePickPath);

// @route   POST /api/pickpaths/generate/all
// @desc    Generate all pick paths for a store
// @access  Private (Manager)
router.post('/generate/all', restrictTo('manager'), generateAllPickPaths);

// @route   POST /api/pickpaths
// @desc    Create custom pick path
// @access  Private (Manager)
router.post('/', restrictTo('manager'), createPickPath);

// @route   GET /api/pickpaths/:id
// @desc    Get single pick path
// @access  Private
router.get('/:id', getPickPath);

// @route   PUT /api/pickpaths/:id
// @desc    Update pick path
// @access  Private (Manager)
router.put('/:id', restrictTo('manager'), updatePickPath);

// @route   PUT /api/pickpaths/:id/activate
// @desc    Set active pick path for a commodity
// @access  Private (Manager)
router.put('/:id/activate', restrictTo('manager'), activatePickPath);

// @route   DELETE /api/pickpaths/:id
// @desc    Delete pick path
// @access  Private (Manager)
router.delete('/:id', restrictTo('manager'), deletePickPath);

module.exports = router;
