const express = require('express');

const {
  createPickWalkReportAlerts,
  createEmployeeCommentAlert,
  dismissAdminAlert,
  listAdminAlerts
} = require('../controllers/alertController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', listAdminAlerts);
router.post('/comments', createEmployeeCommentAlert);
router.post('/reports', createPickWalkReportAlerts);
router.delete('/:id', dismissAdminAlert);

module.exports = router;