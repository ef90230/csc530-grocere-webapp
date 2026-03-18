const { Order } = require('../models');
const { Op } = require('sequelize');

/**
 * Scheduling constraints:
 * 1. Max 20 orders per hour
 * 2. No orders between midnight (00:00) and 8 AM
 * 3. Orders must be scheduled at least 3 hours from now
 * 4. Orders can't be scheduled more than 7 days in advance
 * 5. Schedules purged 48 hours after midnight of that day
 */

const MAX_ORDERS_PER_HOUR = 20;

/**
 * Check if a time is within operating hours (8 AM - 11:59 PM)
 */
const isWithinOperatingHours = (date) => {
  const hour = date.getHours();
  return hour >= 8 && hour < 24;
};

/**
 * Check if a time meets the 3-hour advance requirement
 */
const meetsMinimumAdvanceTime = (scheduledTime, nowTime) => {
  const threeHoursFromNow = new Date(nowTime.getTime() + 3 * 60 * 60 * 1000);
  return scheduledTime >= threeHoursFromNow;
};

/**
 * Check if a time is within 7 days from today (start of today to end of day 7)
 */
const isWithin7Days = (scheduledTime, nowTime) => {
  const today = new Date(nowTime);
  today.setHours(0, 0, 0, 0);
  
  const sevenDaysFromToday = new Date(today);
  sevenDaysFromToday.setDate(sevenDaysFromToday.getDate() + 7);
  sevenDaysFromToday.setHours(23, 59, 59, 999);
  
  return scheduledTime >= today && scheduledTime <= sevenDaysFromToday;
};

/**
 * Count orders for a specific hour
 */
const getOrderCountForHour = async (storeId, hourStart, hourEnd) => {
  const count = await Order.count({
    where: {
      storeId,
      scheduledPickupTime: {
        [Op.gte]: hourStart,
        [Op.lt]: hourEnd
      }
    }
  });
  return count;
};

/**
 * Validate a proposed scheduling time against all constraints
 * Returns { isValid: boolean, errors: string[] }
 */
const validateScheduleTime = async (scheduledTime, storeId, nowTime = new Date()) => {
  const errors = [];

  // Constraint 1: Check operating hours (8 AM - 11:59 PM)
  if (!isWithinOperatingHours(scheduledTime)) {
    errors.push('Orders can only be scheduled between 8:00 AM and 11:59 PM');
  }

  // Constraint 2: Check 3-hour advance requirement
  if (!meetsMinimumAdvanceTime(scheduledTime, nowTime)) {
    const threeHoursFromNow = new Date(nowTime.getTime() + 3 * 60 * 60 * 1000);
    errors.push(
      `Orders must be scheduled at least 3 hours in advance. Earliest available: ${threeHoursFromNow.toISOString()}`
    );
  }

  // Constraint 3: Check 7-day maximum
  if (!isWithin7Days(scheduledTime, nowTime)) {
    errors.push('Orders can only be scheduled up to 7 days in advance');
  }

  // Constraint 4: Check max 20 orders per hour
  const hourStart = new Date(scheduledTime);
  hourStart.setMinutes(0, 0, 0);
  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hourEnd.getHours() + 1);

  const orderCountForHour = await getOrderCountForHour(storeId, hourStart, hourEnd);
  if (orderCountForHour >= MAX_ORDERS_PER_HOUR) {
    errors.push('Scheduling capacity exceeded for that hour');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Get available time slots for a given date range
 * Returns array of available slots with capacity info
 */
const getAvailableTimeSlots = async (storeId, startDate, endDate, nowTime = new Date()) => {
  const slots = [];

  // Create date range - from the date after the 3-hour minimum, up to 7 days out
  let current = new Date(nowTime);

  // Advance to the next valid start time (3 hours from now, rounded up to next hour)
  const threeHoursFromNow = new Date(nowTime.getTime() + 3 * 60 * 60 * 1000);
  current.setHours(threeHoursFromNow.getHours(), 0, 0, 0);
  if (current < threeHoursFromNow) {
    current.setHours(current.getHours() + 1);
  }

  // Don't go before 8 AM
  if (current.getHours() < 8) {
    current.setHours(8, 0, 0, 0);
  }

  // End date should be at most 7 days from today
  const sevenDaysFromToday = new Date(nowTime);
  sevenDaysFromToday.setDate(sevenDaysFromToday.getDate() + 7);
  sevenDaysFromToday.setHours(23, 59, 59, 999);

  const actualEndDate = new Date(Math.min(endDate.getTime(), sevenDaysFromToday.getTime()));

  // Generate hourly slots
  while (current <= actualEndDate) {
    // Skip if outside operating hours
    if (isWithinOperatingHours(current)) {
      const hourStart = new Date(current);
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);

      const orderCount = await getOrderCountForHour(storeId, hourStart, hourEnd);
      const isAvailable = orderCount < MAX_ORDERS_PER_HOUR;

      slots.push({
        time: new Date(hourStart),
        hour: hourStart.getHours(),
        date: hourStart.toISOString().split('T')[0],
        ordersScheduled: orderCount,
        capacity: 20,
        isAvailable
      });
    }

    // Move to next hour
    current.setHours(current.getHours() + 1);

    // Skip to 8 AM if we crossed into a new day before 8 AM
    if (current.getHours() < 8 && current.getDate() !== new Date(current.getTime() - 24 * 60 * 60 * 1000).getDate()) {
      current.setHours(8, 0, 0, 0);
    }
  }

  return slots;
};

/**
 * Purge old schedules: Remove schedule data 48 hours after midnight of that day
 * This should be called periodically (e.g., via a cron job or scheduled task)
 */
const purgeOldSchedules = async () => {
  // Calculate 48 hours ago from now
  const purgeThreshold = new Date();
  purgeThreshold.setHours(purgeThreshold.getHours() - 48);

  // Find the start of that day (midnight)
  const dayStart = new Date(purgeThreshold);
  dayStart.setHours(0, 0, 0, 0);

  // Find the end of that day + 48 hours (midnight + 48 hours)
  const purgeDeadline = new Date(dayStart);
  purgeDeadline.setDate(purgeDeadline.getDate() + 2);
  purgeDeadline.setHours(0, 0, 0, 0);

  try {
    // Remove old completed/cancelled orders that have passed their purge deadline
    const result = await Order.destroy({
      where: {
        scheduledPickupTime: {
          [Op.lt]: purgeDeadline
        },
        status: {
          [Op.in]: ['completed', 'cancelled']
        }
      }
    });

    console.log(`Purged ${result} completed/cancelled orders older than 48 hours from their scheduled date`);
    return result;
  } catch (error) {
    console.error('Error purging old schedules:', error);
    throw error;
  }
};

/**
 * Get next available slot for a given store
 */
const getNextAvailableSlot = async (storeId, nowTime = new Date()) => {
  let current = new Date(nowTime);

  // Advance to the next valid start time (3 hours from now, rounded up to next hour)
  const threeHoursFromNow = new Date(nowTime.getTime() + 3 * 60 * 60 * 1000);
  current.setHours(threeHoursFromNow.getHours(), 0, 0, 0);
  if (current < threeHoursFromNow) {
    current.setHours(current.getHours() + 1);
  }

  // Don't go before 8 AM
  if (current.getHours() < 8) {
    current.setHours(8, 0, 0, 0);
  }

  // Search for next available slot within 7 days
  const maxSearchDate = new Date(nowTime);
  maxSearchDate.setDate(maxSearchDate.getDate() + 7);
  maxSearchDate.setHours(23, 59, 59, 999);

  while (current <= maxSearchDate) {
    const hourStart = new Date(current);
    hourStart.setMinutes(0, 0, 0);
    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const orderCount = await getOrderCountForHour(storeId, hourStart, hourEnd);
    if (orderCount < 20) {
      return {
        time: new Date(hourStart),
        hour: hourStart.getHours(),
        ordersScheduled: orderCount,
        capacity: 20
      };
    }

    current.setHours(current.getHours() + 1);

    // Skip to 8 AM if we crossed into a new day before 8 AM
    if (current.getHours() < 8 && current.getDate() !== new Date(current.getTime() - 24 * 60 * 60 * 1000).getDate()) {
      current.setHours(8, 0, 0, 0);
    }
  }

  return null;
};

module.exports = {
  validateScheduleTime,
  getAvailableTimeSlots,
  getNextAvailableSlot,
  purgeOldSchedules,
  isWithinOperatingHours,
  meetsMinimumAdvanceTime,
  isWithin7Days,
  getOrderCountForHour
};
