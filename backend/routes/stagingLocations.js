const express = require('express');
const router = express.Router();

const {
  getLocations,
  getAssignments,
  createLocation,
  updateLocationOptions,
  updateLocation,
  deleteLocation,
  assignGroup,
  unassignGroup,
  getLocationTotes,
  getOrderTotesSummary
} = require('../controllers/stagingLocationController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getLocations);
router.get('/assignments', getAssignments);
router.post('/', createLocation);
router.patch('/options', updateLocationOptions);
router.post('/assignments', assignGroup);
router.delete('/assignments', unassignGroup);
router.get('/orders/:orderId/totes-summary', getOrderTotesSummary);
router.get('/:id/totes', getLocationTotes);
router.patch('/:id', updateLocation);
router.delete('/:id', deleteLocation);

module.exports = router;