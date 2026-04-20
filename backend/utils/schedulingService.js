const { Order, Store } = require('../models');
const { Op } = require('sequelize');
const {
  normalizeStoreSettings,
  getStoreSettingsFromStore,
  getTimeslotCapacityForDate,
  getTimeslotKeyFromDate,
  getSchedulingHoursForDay,
  getStoreDateRange,
  getStoreTodayKey
} = require('./storeSettings');
const {
  DEFAULT_TIME_ZONE,
  addDaysToDayKey,
  fromTimeZoneParts,
  getTimeZoneDayKey,
  getTimeZoneParts,
  normalizeTimeZone
} = require('./timeZone');

/**
 * Scheduling constraints:
 * 1. Max 20 orders per hour
 * 2. No orders between midnight (00:00) and 8 AM
 * 3. Orders must be scheduled at least 3 hours from now
 * 4. Orders can't be scheduled more than 7 days in advance
 * 5. Schedules purged 48 hours after midnight of that day
 */

const DEFAULT_MAX_ORDERS_PER_HOUR = 20;

const parseClientDateString = (dateString) => {
  const [year, month, day] = String(dateString).split('-').map(Number);
  return { year, monthIndex: month - 1, day };
};

const getStoreSchedulingSettings = async (storeId) => {
  const store = await Store.findByPk(storeId, {
    attributes: ['id', 'backroomDoorLocation']
  });

  if (!store) {
    return normalizeStoreSettings(null);
  }

  return getStoreSettingsFromStore(store);
};

/**
 * Check if a time is within operating hours (8 AM - 11:59 PM)
 */
const isWithinOperatingHours = (storeSettings, dayKey, hour) => {
  const availableHours = getSchedulingHoursForDay(storeSettings, dayKey);
  return availableHours.includes(hour);
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
const getOrderCountForHour = async (storeId, hourStart, hourEnd, options = {}) => {
  const excludeOrderId = Number.isInteger(Number(options?.excludeOrderId)) ? Number(options.excludeOrderId) : null;
  const count = await Order.count({
    where: {
      ...(excludeOrderId ? { id: { [Op.ne]: excludeOrderId } } : {}),
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
const validateScheduleTime = async (scheduledTime, storeId, nowTime = new Date(), options = {}) => {
  const errors = [];
  const storeSettings = await getStoreSchedulingSettings(storeId);
  const timeZone = normalizeTimeZone(storeSettings?.scheduling?.timeZone, DEFAULT_TIME_ZONE);
  const scheduledParts = getTimeZoneParts(scheduledTime, timeZone);
  const nowDayKey = getTimeZoneDayKey(nowTime, timeZone);
  const scheduledDayKey = getTimeZoneDayKey(scheduledTime, timeZone);
  const existingOrderId = Number.isInteger(Number(options?.existingOrderId)) ? Number(options.existingOrderId) : null;
  let preservesExistingScheduledSlot = false;

  if (existingOrderId) {
    const existingOrder = await Order.findOne({
      where: {
        id: existingOrderId,
        storeId
      },
      attributes: ['id', 'scheduledPickupTime']
    });

    preservesExistingScheduledSlot = Boolean(
      existingOrder?.scheduledPickupTime
      && getTimeslotKeyFromDate(existingOrder.scheduledPickupTime)
      && getTimeslotKeyFromDate(existingOrder.scheduledPickupTime) === getTimeslotKeyFromDate(scheduledTime)
    );
  }

  if (!scheduledParts || !scheduledDayKey || !nowDayKey) {
    return {
      isValid: false,
      errors: ['Invalid scheduling time']
    };
  }

  if (preservesExistingScheduledSlot) {
    return {
      isValid: true,
      errors: []
    };
  }

  if (!isWithinOperatingHours(storeSettings, scheduledDayKey, scheduledParts.hour)) {
    errors.push('Orders can only be scheduled during the configured store hours');
  }

  // Constraint 2: Check 3-hour advance requirement
  if (!meetsMinimumAdvanceTime(scheduledTime, nowTime)) {
    const threeHoursFromNow = new Date(nowTime.getTime() + 3 * 60 * 60 * 1000);
    errors.push(
      `Orders must be scheduled at least 3 hours in advance. Earliest available: ${threeHoursFromNow.toISOString()}`
    );
  }

  const maxAllowedDayKey = addDaysToDayKey(nowDayKey, 7);
  if (scheduledDayKey < nowDayKey || scheduledDayKey > maxAllowedDayKey) {
    errors.push('Orders can only be scheduled up to 7 days in advance');
  }

  const hourStart = fromTimeZoneParts(
    scheduledParts.year,
    scheduledParts.month - 1,
    scheduledParts.day,
    scheduledParts.hour,
    0,
    0,
    0,
    timeZone
  );
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

  const orderCountForHour = await getOrderCountForHour(storeId, hourStart, hourEnd);
  const hourCapacity = getTimeslotCapacityForDate(storeSettings, hourStart) || DEFAULT_MAX_ORDERS_PER_HOUR;
  if (orderCountForHour >= hourCapacity) {
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
  const storeSettings = await getStoreSchedulingSettings(storeId);

  const timeZone = normalizeTimeZone(storeSettings?.scheduling?.timeZone, DEFAULT_TIME_ZONE);
  const fallbackRange = getStoreDateRange(storeSettings, getStoreTodayKey(storeSettings, nowTime), 7);
  let currentDayKey = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
    ? startDate
    : fallbackRange.startDayKey;
  const requestedEndDayKey = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ? endDate
    : fallbackRange.endDayKey;
  const maxAllowedDayKey = addDaysToDayKey(getStoreTodayKey(storeSettings, nowTime), 7);
  const actualEndDayKey = requestedEndDayKey < maxAllowedDayKey ? requestedEndDayKey : maxAllowedDayKey;
  const threeHoursFromNow = new Date(nowTime.getTime() + 3 * 60 * 60 * 1000);

  while (currentDayKey && currentDayKey <= actualEndDayKey) {
    const availableHours = getSchedulingHoursForDay(storeSettings, currentDayKey);

    for (const hour of availableHours) {
      const { year, monthIndex, day } = parseClientDateString(currentDayKey);
      const hourStart = fromTimeZoneParts(
        year,
        monthIndex,
        day,
        hour,
        0,
        0,
        0,
        timeZone
      );
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const orderCount = await getOrderCountForHour(storeId, hourStart, hourEnd);
      const slotCapacity = getTimeslotCapacityForDate(storeSettings, hourStart) || DEFAULT_MAX_ORDERS_PER_HOUR;
      const isAvailable = hourStart >= threeHoursFromNow && orderCount < slotCapacity;

      slots.push({
        time: new Date(hourStart),
        hour,
        date: currentDayKey,
        ordersScheduled: orderCount,
        capacity: slotCapacity,
        isAvailable,
        timeZone
      });
    }

    currentDayKey = addDaysToDayKey(currentDayKey, 1);
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
  const storeSettings = await getStoreSchedulingSettings(storeId);
  const timeZone = normalizeTimeZone(storeSettings?.scheduling?.timeZone, DEFAULT_TIME_ZONE);
  const slots = await getAvailableTimeSlots(
    storeId,
    getStoreTodayKey(storeSettings, nowTime),
    addDaysToDayKey(getStoreTodayKey(storeSettings, nowTime), 7),
    nowTime
  );

  const nextAvailableSlot = slots.find((slot) => slot.isAvailable);
  if (!nextAvailableSlot) {
    return null;
  }

  return {
    time: new Date(nextAvailableSlot.time),
    hour: nextAvailableSlot.hour,
    date: nextAvailableSlot.date,
    ordersScheduled: nextAvailableSlot.ordersScheduled,
    capacity: nextAvailableSlot.capacity,
    timeZone
  };
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
