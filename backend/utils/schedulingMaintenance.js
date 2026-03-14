/**
 * Scheduling maintenance utilities
 * These can be called periodically via cron jobs or scheduled tasks
 */

const { purgeOldSchedules } = require('./schedulingService');

/**
 * Initialize scheduling maintenance jobs
 * Should be called once when the server starts
 */
const initializeSchedulingMaintenance = () => {
  console.log('Initializing scheduling maintenance jobs...');

  // Run schedule purge every 6 hours
  // This ensures old schedules are cleaned up regularly
  setInterval(async () => {
    try {
      console.log(`[${new Date().toISOString()}] Running scheduled purge...`);
      const purgedCount = await purgeOldSchedules();
      console.log(`[${new Date().toISOString()}] Purge completed. Removed ${purgedCount} orders`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error during scheduled purge:`, error);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds

  console.log('Scheduling maintenance jobs initialized');
};

module.exports = {
  initializeSchedulingMaintenance
};
