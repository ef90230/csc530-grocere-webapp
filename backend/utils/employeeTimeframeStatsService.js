const { Employee, Order, OrderItem } = require('../models');
const { Op } = require('sequelize');
const {
  getCompletedPickWalkHistory
} = require('./employeeMetricsService');
const {
  getEmployeeDayTotals,
  getLocalDayKey
} = require('./employeeTotesHistoryStore');
const { getWalkSummariesForEmployee } = require('./walkPerformanceStore');

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
  'ordersDispensed'
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
  ordersDispensed: 0
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampPercent = (value) => Math.max(0, Math.min(100, toNumber(value)));

const getDayKey = (dateInput) => {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  const postSubstitutionPercent = totalPicks > 0 ? (substituted / totalPicks) * 100 : 0;
  const preSubstitutionPercent = Math.min(postSubstitutionPercent, 100);
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
    ordersDispensed: Math.max(0, Math.round(toNumber(dayData.ordersDispensed)))
  };
};

const ensureDayAccumulator = (accumulatorByDay, dayKey) => {
  if (!dayKey) {
    return null;
  }

  if (!accumulatorByDay[dayKey]) {
    accumulatorByDay[dayKey] = {
      totalItems: 0,
      totalPicks: 0,
      substituted: 0,
      notFound: 0,
      onTimeTotal: 0,
      onTimeCount: 0,
      walkRates: [],
      ftprRates: [],
      totesStaged: 0,
      ordersDispensed: 0
    };
  }

  return accumulatorByDay[dayKey];
};

const buildEmployeeDayStatsMap = async (employeeId) => {
  const normalizedEmployeeId = Number(employeeId);
  if (!Number.isInteger(normalizedEmployeeId)) {
    return {};
  }

  const dayAccumulator = {};

  const pickerOrders = await Order.findAll({
    where: {
      assignedPickerId: normalizedEmployeeId,
      pickingEndTime: { [Op.ne]: null }
    },
    attributes: ['id', 'pickingEndTime'],
    include: [
      {
        model: OrderItem,
        as: 'items',
        attributes: ['status', 'foundOnFirstAttempt']
      }
    ]
  });

  pickerOrders.forEach((order) => {
    const dayKey = getDayKey(order.pickingEndTime);
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    (order.items || []).forEach((item) => {
      day.totalItems += 1;

      if (item.status === 'found' || item.status === 'substituted') {
        day.totalPicks += 1;
      }

      if (item.status === 'substituted') {
        day.substituted += 1;
      }

      if (item.status === 'out_of_stock' || item.status === 'skipped') {
        day.notFound += 1;
      }
    });
  });

  const pickerPickupOrders = await Order.findAll({
    where: {
      assignedPickerId: normalizedEmployeeId,
      actualPickupTime: { [Op.ne]: null }
    },
    attributes: ['scheduledPickupTime', 'actualPickupTime']
  });

  pickerPickupOrders.forEach((order) => {
    const dayKey = getDayKey(order.actualPickupTime);
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.onTimeTotal += 1;

    const scheduled = new Date(order.scheduledPickupTime);
    const actual = new Date(order.actualPickupTime);

    if (!Number.isNaN(scheduled.getTime()) && !Number.isNaN(actual.getTime()) && actual <= scheduled) {
      day.onTimeCount += 1;
    }
  });

  const dispenserOrders = await Order.findAll({
    where: {
      assignedDispenserId: normalizedEmployeeId,
      status: 'completed',
      actualPickupTime: { [Op.ne]: null }
    },
    attributes: ['actualPickupTime']
  });

  dispenserOrders.forEach((order) => {
    const dayKey = getDayKey(order.actualPickupTime);
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.ordersDispensed += 1;
  });

  const walkHistory = await getCompletedPickWalkHistory(normalizedEmployeeId);
  walkHistory.forEach((walk) => {
    const dayKey = getDayKey(walk?.startedAt);
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.walkRates.push(toNumber(walk?.pickRate));
  });

  const walkSummaries = getWalkSummariesForEmployee(normalizedEmployeeId, { closedOnly: true });
  walkSummaries.forEach((walkSummary) => {
    const dayKey = getDayKey(walkSummary?.startedAt);
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.ftprRates.push(toNumber(walkSummary?.firstTimePickRate));
  });

  const totesByDay = getEmployeeDayTotals(normalizedEmployeeId);
  Object.entries(totesByDay).forEach(([dayKey, toteCount]) => {
    const day = ensureDayAccumulator(dayAccumulator, dayKey);
    if (!day) {
      return;
    }

    day.totesStaged = Math.max(0, Math.round(toNumber(toteCount)));
  });

  const todayKey = getLocalDayKey(new Date());
  const hasTodayTotesInHistory = Number.isFinite(toNumber(totesByDay[todayKey])) && toNumber(totesByDay[todayKey]) > 0;

  if (!hasTodayTotesInHistory) {
    const employeeRecord = await Employee.findByPk(normalizedEmployeeId, {
      attributes: ['id', 'totesStaged']
    });

    const fallbackTodayTotes = Math.max(0, Math.round(toNumber(employeeRecord?.totesStaged)));
    if (fallbackTodayTotes > 0) {
      const day = ensureDayAccumulator(dayAccumulator, todayKey);
      if (day) {
        day.totesStaged = fallbackTodayTotes;
      }
    }
  }

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

const getEmployeeTimeframeStats = async (employeeId) => {
  const dayStatsMap = await buildEmployeeDayStatsMap(employeeId);
  const todayKey = getLocalDayKey(new Date());

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

  AVERAGE_METRIC_FIELDS.forEach((field) => {
    const total = rows.reduce((sum, row) => sum + toNumber(row[field]), 0);
    summary[field] = Number((total / rows.length).toFixed(2));
  });

  TOTAL_METRIC_FIELDS.forEach((field) => {
    const total = rows.reduce((sum, row) => sum + toNumber(row[field]), 0);
    summary[field] = Math.max(0, Math.round(total));
  });

  return summary;
};

module.exports = {
  EMPTY_STATS,
  getEmployeeTimeframeStats,
  aggregateStoreStats,
  buildAllTimeFromDayStats,
  buildEmployeeDayStatsMap,
  getDayBounds,
  addDays
};
