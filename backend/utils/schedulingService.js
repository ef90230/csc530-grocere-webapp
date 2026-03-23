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

const normalizeTimezoneOffset = (timezoneOffsetMinutes = 0) => {
  const parsedOffset = Number(timezoneOffsetMinutes);
  return Number.isFinite(parsedOffset) ? parsedOffset : 0;
};

const toClientTimezoneDate = (date, timezoneOffsetMinutes = 0) => {
  const normalizedOffset = normalizeTimezoneOffset(timezoneOffsetMinutes);
  return new Date(date.getTime() - normalizedOffset * 60 * 1000);
};

const fromClientTimezoneParts = (year, monthIndex, day, hour, minute, second, millisecond, timezoneOffsetMinutes = 0) => {
  const normalizedOffset = normalizeTimezoneOffset(timezoneOffsetMinutes);
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, second, millisecond) + normalizedOffset * 60 * 1000);
};

const parseClientDateString = (dateString) => {
  const [year, month, day] = String(dateString).split('-').map(Number);
  return { year, monthIndex: month - 1, day };
};

/**
 * Check if a time is within operating hours (8 AM - 11:59 PM)
 */
const isWithinOperatingHours = (date) => {
  const hour = date.getUTCHours();
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
  today.setUTCHours(0, 0, 0, 0);

  const sevenDaysFromToday = new Date(today);
  sevenDaysFromToday.setUTCDate(sevenDaysFromToday.getUTCDate() + 7);
  sevenDaysFromToday.setUTCHours(23, 59, 59, 999);
  
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
const validateScheduleTime = async (scheduledTime, storeId, nowTime = new Date(), timezoneOffsetMinutes = 0) => {
  const errors = [];
  const clientScheduledTime = toClientTimezoneDate(scheduledTime, timezoneOffsetMinutes);
  const clientNowTime = toClientTimezoneDate(nowTime, timezoneOffsetMinutes);

  // Constraint 1: Check operating hours (8 AM - 11:59 PM)
  if (!isWithinOperatingHours(clientScheduledTime)) {
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
  if (!isWithin7Days(clientScheduledTime, clientNowTime)) {
    errors.push('Orders can only be scheduled up to 7 days in advance');
  }

  // Constraint 4: Check max 20 orders per hour
  const hourStart = fromClientTimezoneParts(
    clientScheduledTime.getUTCFullYear(),
    clientScheduledTime.getUTCMonth(),
    clientScheduledTime.getUTCDate(),
    clientScheduledTime.getUTCHours(),
    0,
    0,
    0,
    timezoneOffsetMinutes
  );
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

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
const getAvailableTimeSlots = async (storeId, startDate, endDate, nowTime = new Date(), timezoneOffsetMinutes = 0) => {
  const slots = [];

  const startParts = typeof startDate === 'string'
    ? parseClientDateString(startDate)
    : {
        year: startDate.getFullYear(),
        monthIndex: startDate.getMonth(),
        day: startDate.getDate()
      };
  const endParts = typeof endDate === 'string'
    ? parseClientDateString(endDate)
    : {
        year: endDate.getFullYear(),
        monthIndex: endDate.getMonth(),
        day: endDate.getDate()
      };

  let current = new Date(Date.UTC(startParts.year, startParts.monthIndex, startParts.day, 0, 0, 0, 0));
  const requestedEndDate = new Date(Date.UTC(endParts.year, endParts.monthIndex, endParts.day, 23, 59, 59, 999));
  const clientNowTime = toClientTimezoneDate(nowTime, timezoneOffsetMinutes);
  const threeHoursFromNow = new Date(clientNowTime.getTime() + 3 * 60 * 60 * 1000);

  const sevenDaysFromToday = new Date(clientNowTime);
  sevenDaysFromToday.setUTCDate(sevenDaysFromToday.getUTCDate() + 7);
  sevenDaysFromToday.setUTCHours(23, 59, 59, 999);

  const actualEndDate = new Date(Math.min(requestedEndDate.getTime(), sevenDaysFromToday.getTime()));

  while (current <= actualEndDate) {
    for (let hour = 8; hour < 24; hour += 1) {
      const clientHourStart = new Date(Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate(),
        hour,
        0,
        0,
        0
      ));

      if (clientHourStart > actualEndDate) {
        continue;
      }

      const hourStart = fromClientTimezoneParts(
        clientHourStart.getUTCFullYear(),
        clientHourStart.getUTCMonth(),
        clientHourStart.getUTCDate(),
        clientHourStart.getUTCHours(),
        0,
        0,
        0,
        timezoneOffsetMinutes
      );
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const orderCount = await getOrderCountForHour(storeId, hourStart, hourEnd);
      const isAvailable = clientHourStart >= threeHoursFromNow && orderCount < MAX_ORDERS_PER_HOUR;

      slots.push({
        time: new Date(hourStart),
        hour,
        date: `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`,
        ordersScheduled: orderCount,
        capacity: MAX_ORDERS_PER_HOUR,
        isAvailable
      });
    }

    current = new Date(Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate() + 1,
      0,
      0,
      0,
      0
    ));
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
const getNextAvailableSlot = async (storeId, nowTime = new Date(), timezoneOffsetMinutes = 0) => {
  const clientNowTime = toClientTimezoneDate(nowTime, timezoneOffsetMinutes);
  const threeHoursFromNow = new Date(clientNowTime.getTime() + 3 * 60 * 60 * 1000);

  let current = new Date(Date.UTC(
    threeHoursFromNow.getUTCFullYear(),
    threeHoursFromNow.getUTCMonth(),
    threeHoursFromNow.getUTCDate(),
    threeHoursFromNow.getUTCHours(),
    0,
    0,
    0
  ));

  // Round up to next hour if not already at hour boundary
  if (current < threeHoursFromNow) {
    current = new Date(Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
      current.getUTCHours() + 1,
      0,
      0,
      0
    ));
  }

  // Don't go before 8 AM
  if (current.getUTCHours() < 8) {
    current = new Date(Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
      8,
      0,
      0,
      0
    ));
  }

  // Search for next available slot within 7 days
  const maxSearchDate = new Date(clientNowTime);
  maxSearchDate.setUTCDate(maxSearchDate.getUTCDate() + 7);
  maxSearchDate.setUTCHours(23, 59, 59, 999);

  while (current <= maxSearchDate) {
    const clientHourStart = new Date(current);
    const hourStart = fromClientTimezoneParts(
      clientHourStart.getUTCFullYear(),
      clientHourStart.getUTCMonth(),
      clientHourStart.getUTCDate(),
      clientHourStart.getUTCHours(),
      0,
      0,
      0,
      timezoneOffsetMinutes
    );
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

    const orderCount = await getOrderCountForHour(storeId, hourStart, hourEnd);
    if (orderCount < 20) {
      return {
        time: new Date(hourStart),
        hour: clientHourStart.getUTCHours(),
        ordersScheduled: orderCount,
        capacity: 20
      };
    }

    current = new Date(Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
      current.getUTCHours() + 1,
      0,
      0,
      0
    ));

    // Skip to 8 AM if we crossed into a new day before 8 AM
    if (current.getUTCHours() < 8 && current.getUTCDate() !== new Date(current.getTime() - 24 * 60 * 60 * 1000).getUTCDate()) {
      current = new Date(Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate(),
        8,
        0,
        0,
        0
      ));
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
