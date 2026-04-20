const { Order, OrderItem, Item } = require('../models');
const { Op } = require('sequelize');
const {
  getCompletedPickWalkHistory
} = require('./employeeMetricsService');
const {
  getEmployeeDayTotals,
  getLocalDayKey
} = require('./employeeTotesHistoryStore');
const {
  getEmployeeDayTotals: getEmployeeItemsStagedDayTotals
} = require('./employeeStagedItemsHistoryStore');
const { getWalkSummariesForEmployee } = require('./walkPerformanceStore');
const {
  getStoreDayTotals: getStoreWaitTimeDayTotals,
  getLocalDayKey: getLocalDayKeyForWaitTime
} = require('./storeWaitTimeHistoryStore');
const { DEFAULT_TIME_ZONE, getTimeZoneDayKey, normalizeTimeZone } = require('./timeZone');

const AVERAGE_METRIC_FIELDS = [
  'pickRate',
  'firstTimePickPercent',
  'preSubstitutionPercent',
  'postSubstitutionPercent',
  'percentNotFound',
  'onTimePercent',
  'weightedEfficiency'
];

const TOTAL_METRIC_FIELDS = [
  'itemsPicked',
  'totesStaged',
  'itemsStaged',
  'ordersDispensed',
  'totesDispensed',
  'itemsDispensed'
];

const EMPTY_STATS = {
  pickRate: 0,
  itemsPicked: 0,
  firstTimePickPercent: 0,
  preSubstitutionPercent: 0,
  postSubstitutionPercent: 0,
  percentNotFound: 0,
  onTimePercent: 0,
  weightedEfficiency: 0,
  totesStaged: 0,
  itemsStaged: 0,
  ordersDispensed: 0,
  totesDispensed: 0,
  itemsDispensed: 0
};

const NON_DISPENSABLE_ITEM_STATUSES = new Set(['out_of_stock', 'skipped', 'not_found', 'cancelled', 'canceled']);
const NOT_FOUND_ITEM_STATUSES = new Set(['not_found']);
const CANCELED_ITEM_STATUSES = new Set(['cancelled', 'canceled']);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const isItemPicked = (orderItem) => {
  const status = normalizeStatus(orderItem?.status);
  if (status === 'found' || status === 'substituted') {
    return true;
  }

  return toNumber(orderItem?.pickedQuantity) > 0;
};

const resolveOriginalPickedQuantity = (orderItem) => {
  const status = normalizeStatus(orderItem?.status);
  if (status === 'substituted') {
    return 0;
  }

  const orderedQtyRaw = Math.max(0, Math.round(toNumber(orderItem?.quantity)));
  const orderedQty = orderedQtyRaw > 0 ? orderedQtyRaw : 1;
  const pickedQty = Math.max(0, Math.round(toNumber(orderItem?.pickedQuantity)));

  if (pickedQty > 0) {
    return Math.min(orderedQty, pickedQty);
  }

  if (status === 'found') {
    return orderedQty;
  }

  return 0;
};

const resolveOriginalSubstitutedQuantity = (orderItem) => {
  const status = normalizeStatus(orderItem?.status);
  if (status !== 'substituted') {
    return 0;
  }

  const orderedQtyRaw = Math.max(0, Math.round(toNumber(orderItem?.quantity)));
  return orderedQtyRaw > 0 ? orderedQtyRaw : 1;
};

const resolveItemPickedAt = (orderItem, order) => {
  const itemPickedAt = new Date(orderItem?.pickedAt);
  if (!Number.isNaN(itemPickedAt.getTime())) {
    return itemPickedAt;
  }

  const orderEndTime = new Date(order?.pickingEndTime);
  if (!Number.isNaN(orderEndTime.getTime())) {
    return orderEndTime;
  }

  const itemUpdatedAt = new Date(orderItem?.updatedAt);
  if (!Number.isNaN(itemUpdatedAt.getTime())) {
    return itemUpdatedAt;
  }

  return null;
};

const clampPercent = (value) => Math.max(0, Math.min(100, toNumber(value)));

const resolveDispensableItemQuantity = (orderItem) => {
  const normalizedStatus = String(orderItem?.status || '').trim().toLowerCase();
  if (NON_DISPENSABLE_ITEM_STATUSES.has(normalizedStatus)) {
    return 0;
  }

  const pickedQuantity = toNumber(orderItem?.pickedQuantity);
  if (pickedQuantity > 0) {
    return Math.max(0, Math.round(pickedQuantity));
  }

  const quantity = toNumber(orderItem?.quantity);
  if (quantity > 0) {
    return Math.max(0, Math.round(quantity));
  }

  return 0;
};

const getDayKey = (dateInput, timeZone = DEFAULT_TIME_ZONE) => getTimeZoneDayKey(dateInput, normalizeTimeZone(timeZone));

const addDays = (dayKey, daysToAdd) => {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
  date.setDate(date.getDate() + Number(daysToAdd || 0));
  return getDayKey(date);
};

const getDayBounds = (dayKey) => {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  const start = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
  const end = new Date(year, (month || 1) - 1, day || 1, 23, 59, 59, 999);
  return { start, end };
};

const cloneEmptyStats = () => ({ ...EMPTY_STATS });

const finalizeDayAccumulator = (dayData = {}) => {
  const totalItems = toNumber(dayData.totalItems);
  const originalItemsTotal = toNumber(dayData.originalItemsTotal);
  const originalItemsPicked = toNumber(dayData.originalItemsPicked);
  const originalItemsSubstituted = toNumber(dayData.originalItemsSubstituted);
  const totalPicks = toNumber(dayData.totalPicks);
  const substituted = toNumber(dayData.substituted);
  const notFound = toNumber(dayData.notFound);
  const onTimeTotal = toNumber(dayData.onTimeTotal);
  const onTimeCount = toNumber(dayData.onTimeCount);
  const walkRates = Array.isArray(dayData.walkRates) ? dayData.walkRates : [];
  const ftprRates = Array.isArray(dayData.ftprRates) ? dayData.ftprRates : [];

  const firstTimePickPercent = ftprRates.length > 0
    ? ftprRates.reduce((sum, rate) => sum + toNumber(rate), 0) / ftprRates.length
    : 0;
  const postSubstitutionPercent = originalItemsTotal > 0
    ? ((originalItemsPicked + originalItemsSubstituted) / originalItemsTotal) * 100
    : 0;
  const preSubstitutionPercent = originalItemsTotal > 0
    ? (originalItemsPicked / originalItemsTotal) * 100
    : 0;
  const percentNotFound = totalItems > 0 ? (notFound / totalItems) * 100 : 0;
  const onTimePercent = onTimeTotal > 0 ? (onTimeCount / onTimeTotal) * 100 : 0;
  const weightedEfficiency = totalPicks > 0
    ? (firstTimePickPercent + preSubstitutionPercent + (100 - percentNotFound)) / 3
    : 0;

  const walkRateTotal = walkRates.reduce((sum, rate) => sum + toNumber(rate), 0);
  const pickRate = walkRates.length > 0 ? walkRateTotal / walkRates.length : 0;

  return {
    pickRate: Number(pickRate.toFixed(2)),
    itemsPicked: Math.max(0, Math.round(totalPicks)),
    firstTimePickPercent: Number(clampPercent(firstTimePickPercent).toFixed(2)),
    preSubstitutionPercent: Number(clampPercent(preSubstitutionPercent).toFixed(2)),
    postSubstitutionPercent: Number(clampPercent(postSubstitutionPercent).toFixed(2)),
    percentNotFound: Number(clampPercent(percentNotFound).toFixed(2)),
    onTimePercent: Number(clampPercent(onTimePercent).toFixed(2)),
    weightedEfficiency: Number(clampPercent(weightedEfficiency).toFixed(2)),
    totesStaged: Math.max(0, Math.round(toNumber(dayData.totesStaged))),
    itemsStaged: Math.max(0, Math.round(toNumber(dayData.itemsStaged))),
    ordersDispensed: Math.max(0, Math.round(toNumber(dayData.ordersDispensed))),
    totesDispensed: Math.max(0, Math.round(toNumber(dayData.totesDispensed))),
    itemsDispensed: Math.max(0, Math.round(toNumber(dayData.itemsDispensed)))
  };
};

const ensureDayAccumulator = (accumulatorByDay, dayKey) => {
  if (!dayKey) {
    return null;
  }

  if (!accumulatorByDay[dayKey]) {
    accumulatorByDay[dayKey] = {
      totalItems: 0,
      originalItemsTotal: 0,
      originalItemsPicked: 0,
      originalItemsSubstituted: 0,
      totalPicks: 0,
      substituted: 0,
      notFound: 0,
      onTimeTotal: 0,
      onTimeCount: 0,
      walkRates: [],
      ftprRates: [],
      totesStaged: 0,
      itemsStaged: 0,
      ordersDispensed: 0,
      totesDispensed: 0,
      itemsDispensed: 0
    };
  }

  return accumulatorByDay[dayKey];
};

const buildEmployeeDayStatsMap = async (employeeId, timeZone = DEFAULT_TIME_ZONE) => {
  const normalizedEmployeeId = Number(employeeId);
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  if (!Number.isInteger(normalizedEmployeeId)) {
    return {};
  }

  const dayAccumulator = {};
  const walkSummaries = getWalkSummariesForEmployee(normalizedEmployeeId, { closedOnly: true });
  const hasWalkSummaries = walkSummaries.length > 0;

  const pickerOrders = await Order.findAll({
    where: {
      assignedPickerId: normalizedEmployeeId,
      pickingStartTime: { [Op.ne]: null }
    },
    attributes: ['id', 'status', 'scheduledPickupTime', 'pickingStartTime', 'pickingEndTime'],
    include: [
      {
        model: OrderItem,
        as: 'items',
        attributes: ['status', 'quantity', 'pickedQuantity', 'pickedAt', 'updatedAt']
      }
    ]
  });

  pickerOrders.forEach((order) => {
    const dayKey = getDayKey(order.pickingEndTime || order.scheduledPickupTime || order.pickingStartTime, normalizedTimeZone);
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    (order.items || []).forEach((item) => {
      const itemStatus = normalizeStatus(item?.status);
      const orderedQty = Math.max(0, Math.round(toNumber(item.quantity)));
      const pickedQty = Math.max(0, Math.round(toNumber(item.pickedQuantity)));
      const normalizedOrderedQty = orderedQty > 0 ? orderedQty : 1;
      day.totalItems += normalizedOrderedQty;
      day.originalItemsTotal += normalizedOrderedQty;
      day.originalItemsPicked += resolveOriginalPickedQuantity(item);
      day.originalItemsSubstituted += resolveOriginalSubstitutedQuantity(item);

      if (!hasWalkSummaries && (item.status === 'found' || item.status === 'substituted')) {
        day.totalPicks += pickedQty > 0 ? pickedQty : 1;
      }

      if (itemStatus === 'substituted') {
        day.substituted += pickedQty > 0 ? pickedQty : 1;
      }

      if (!NOT_FOUND_ITEM_STATUSES.has(itemStatus)) {
        const dueAt = new Date(order?.scheduledPickupTime);
        const isDueValid = !Number.isNaN(dueAt.getTime());
        const pickedAt = resolveItemPickedAt(item, order);
        const pickedOnTime = Boolean(pickedAt)
          && isDueValid
          && pickedAt.getTime() <= dueAt.getTime();
        const includeAsCanceled = CANCELED_ITEM_STATUSES.has(itemStatus);

        if (isItemPicked(item) || includeAsCanceled) {
          day.onTimeTotal += 1;
          if (pickedOnTime) {
            day.onTimeCount += 1;
          }
        }
      }
    });
  });

  const dispenserOrders = await Order.findAll({
    where: {
      assignedDispenserId: normalizedEmployeeId,
      status: 'completed',
      actualPickupTime: { [Op.ne]: null }
    },
    attributes: ['actualPickupTime'],
    include: [
      {
        model: OrderItem,
        as: 'items',
        required: false,
        attributes: ['status', 'quantity', 'pickedQuantity'],
        include: [
          {
            model: Item,
            as: 'item',
            required: false,
            attributes: ['commodity']
          }
        ]
      }
    ]
  });

  dispenserOrders.forEach((order) => {
    const dayKey = getDayKey(order.actualPickupTime, normalizedTimeZone);
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.ordersDispensed += 1;

    const dispensedCommoditySet = new Set();
    let dispensedItemCount = 0;

    (order.items || []).forEach((orderItem) => {
      const itemQty = resolveDispensableItemQuantity(orderItem);
      if (itemQty <= 0) {
        return;
      }

      dispensedItemCount += itemQty;
      const commodity = String(orderItem?.item?.commodity || '').trim().toLowerCase();
      if (commodity) {
        dispensedCommoditySet.add(commodity);
      }
    });

    day.totesDispensed += dispensedCommoditySet.size;
    day.itemsDispensed += dispensedItemCount;
  });

  const walkHistory = await getCompletedPickWalkHistory(normalizedEmployeeId);
  walkHistory.forEach((walk) => {
    const dayKey = getDayKey(walk?.startedAt, normalizedTimeZone);
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.walkRates.push(toNumber(walk?.pickRate));
  });

  walkSummaries.forEach((walkSummary) => {
    const dayKey = getDayKey(walkSummary?.startedAt, normalizedTimeZone);
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.totalPicks += Math.max(0, Math.round(toNumber(walkSummary?.pickedQuantity)));
    day.ftprRates.push(toNumber(walkSummary?.firstTimePickRate));
    day.notFound += Math.max(0, Math.round(toNumber(walkSummary?.mistakeItems)));
  });

  const totesByDay = getEmployeeDayTotals(normalizedEmployeeId);
  Object.entries(totesByDay).forEach(([dayKey, toteCount]) => {
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.totesStaged = Math.max(0, Math.round(toNumber(toteCount)));
  });

  const stagedItemsByDay = getEmployeeItemsStagedDayTotals(normalizedEmployeeId);
  Object.entries(stagedItemsByDay).forEach(([dayKey, stagedItems]) => {
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.itemsStaged = Math.max(0, Math.round(toNumber(stagedItems)));
  });

  return Object.entries(dayAccumulator).reduce((accumulator, [dayKey, dayData]) => {
    accumulator[dayKey] = finalizeDayAccumulator(dayData);
    return accumulator;
  }, {});
};

const buildAllTimeFromDayStats = (dayStatsMap) => {
  const dayEntries = Object.values(dayStatsMap || {});
  if (dayEntries.length === 0) {
    return cloneEmptyStats();
  }

  const allTime = cloneEmptyStats();

  AVERAGE_METRIC_FIELDS.forEach((field) => {
    const total = dayEntries.reduce((sum, dayStats) => sum + toNumber(dayStats?.[field]), 0);
    allTime[field] = Number((total / dayEntries.length).toFixed(2));
  });

  TOTAL_METRIC_FIELDS.forEach((field) => {
    const total = dayEntries.reduce((sum, dayStats) => sum + toNumber(dayStats?.[field]), 0);
    allTime[field] = Math.max(0, Math.round(total));
  });

  return allTime;
};

const getEmployeeTimeframeStats = async (employeeId, options = {}) => {
  const normalizedTimeZone = normalizeTimeZone(options?.timeZone, DEFAULT_TIME_ZONE);
  const dayStatsMap = await buildEmployeeDayStatsMap(employeeId, normalizedTimeZone);
  const todayKey = getLocalDayKey(new Date(), normalizedTimeZone);

  return {
    today: dayStatsMap[todayKey] || cloneEmptyStats(),
    allTime: buildAllTimeFromDayStats(dayStatsMap)
  };
};

const aggregateStoreStats = (employeeStats, timeframeKey) => {
  const rows = Array.isArray(employeeStats)
    ? employeeStats
      .map((stats) => (stats && stats[timeframeKey] ? stats[timeframeKey] : null))
      .filter(Boolean)
    : [];

  if (rows.length === 0) {
    return cloneEmptyStats();
  }

  const summary = cloneEmptyStats();
  const totalPickedWeight = rows.reduce((sum, row) => sum + Math.max(0, toNumber(row.itemsPicked)), 0);

  AVERAGE_METRIC_FIELDS.forEach((field) => {
    if (totalPickedWeight <= 0) {
      summary[field] = 0;
      return;
    }

    const weightedTotal = rows.reduce((sum, row) => {
      const pickedWeight = Math.max(0, toNumber(row.itemsPicked));
      if (pickedWeight <= 0) {
        return sum;
      }

      return sum + (toNumber(row[field]) * pickedWeight);
    }, 0);

    summary[field] = Number((weightedTotal / totalPickedWeight).toFixed(2));
  });

  TOTAL_METRIC_FIELDS.forEach((field) => {
    const total = rows.reduce((sum, row) => sum + toNumber(row[field]), 0);
    summary[field] = Math.max(0, Math.round(total));
  });

  return summary;
};

const getStoreWaitTimeStats = (storeId, options = {}) => {
  const dayTotals = getStoreWaitTimeDayTotals(storeId);
  const normalizedTimeZone = normalizeTimeZone(options?.timeZone, DEFAULT_TIME_ZONE);
  const todayKey = getLocalDayKeyForWaitTime(new Date(), normalizedTimeZone);

  const todayData = dayTotals[todayKey] || { totalMinutes: 0, orderCount: 0 };
  const todayAvg = todayData.orderCount > 0 ? todayData.totalMinutes / todayData.orderCount : 0;

  let allTotalMinutes = 0;
  let allOrderCount = 0;
  Object.values(dayTotals).forEach((day) => {
    allTotalMinutes += toNumber(day.totalMinutes);
    allOrderCount += Math.max(0, Math.round(toNumber(day.orderCount)));
  });
  const allTimeAvg = allOrderCount > 0 ? allTotalMinutes / allOrderCount : 0;

  return {
    today: {
      avgWaitTimeMinutes: Number(todayAvg.toFixed(2)),
      cumulativeWaitTimeMinutes: Number(todayData.totalMinutes.toFixed(2))
    },
    allTime: {
      avgWaitTimeMinutes: Number(allTimeAvg.toFixed(2)),
      cumulativeWaitTimeMinutes: Number(allTotalMinutes.toFixed(2))
    }
  };
};

module.exports = {
  EMPTY_STATS,
  getEmployeeTimeframeStats,
  aggregateStoreStats,
  buildAllTimeFromDayStats,
  buildEmployeeDayStatsMap,
  getStoreWaitTimeStats,
  getDayBounds,
  addDays
};
