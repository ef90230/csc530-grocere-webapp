const { Employee, Item, Order, OrderItem } = require('../models');
const { Op } = require('sequelize');
const {
  getWalkSummariesForEmployee,
  makeWalkKey,
  getWalkFtprByKey
} = require('./walkPerformanceStore');

const COMMODITY_DISPLAY_NAMES = {
  ambient: 'Ambient',
  chilled: 'Chilled',
  frozen: 'Frozen',
  hot: 'Hot',
  oversized: 'Oversized',
  restricted: 'Restricted'
};

const toNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const clampPercent = (value) => {
  if (value == null || isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Number(value)));
};

const resolveOriginalPickedQuantity = (orderItem) => {
  const status = String(orderItem?.status || '').trim().toLowerCase();
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
  const status = String(orderItem?.status || '').trim().toLowerCase();
  if (status !== 'substituted') {
    return 0;
  }

  const orderedQtyRaw = Math.max(0, Math.round(toNumber(orderItem?.quantity)));
  return orderedQtyRaw > 0 ? orderedQtyRaw : 1;
};

const getWalkDurationHours = (startedAt, endedAt) => {
  const startTime = new Date(startedAt);
  const endTime = new Date(endedAt);

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return 0;
  }

  const elapsedMs = Math.max(0, endTime.getTime() - startTime.getTime());
  return elapsedMs / (1000 * 60 * 60);
};

const getWalkCountLookupKey = ({ employeeId, startedAt, commodity }) => {
  const normalizedEmployeeId = Number(employeeId);
  const startedDate = new Date(startedAt);
  const normalizedCommodity = String(commodity || '').trim().toLowerCase();

  if (!Number.isInteger(normalizedEmployeeId) || Number.isNaN(startedDate.getTime()) || !normalizedCommodity) {
    return '';
  }

  return `${normalizedEmployeeId}::${startedDate.toISOString()}::${normalizedCommodity}`;
};

const buildOrderCountLookup = async (walkSummaries) => {
  const unresolvedSummaries = (Array.isArray(walkSummaries) ? walkSummaries : [])
    .filter((summary) => Math.round(toNumber(summary?.orderCount)) <= 0)
    .filter((summary) => summary?.employeeId && summary?.startedAt && summary?.commodity);

  if (unresolvedSummaries.length === 0) {
    return new Map();
  }

  const targetEmployeeIds = Array.from(new Set(
    unresolvedSummaries
      .map((summary) => Number(summary.employeeId))
      .filter((employeeId) => Number.isInteger(employeeId))
  ));

  if (targetEmployeeIds.length === 0) {
    return new Map();
  }

  const orders = await Order.findAll({
    where: {
      assignedPickerId: targetEmployeeIds.length === 1
        ? targetEmployeeIds[0]
        : { [Op.in]: targetEmployeeIds },
      pickingStartTime: { [Op.ne]: null }
    },
    attributes: ['id', 'assignedPickerId', 'pickingStartTime'],
    include: [
      {
        model: OrderItem,
        as: 'items',
        required: true,
        attributes: ['id'],
        include: [
          {
            model: Item,
            as: 'item',
            required: true,
            attributes: ['commodity']
          }
        ]
      }
    ]
  });

  const lookup = new Map();

  orders.forEach((order) => {
    const startedAt = order?.pickingStartTime;
    const employeeId = Number(order?.assignedPickerId);
    if (!startedAt || !Number.isInteger(employeeId)) {
      return;
    }

    const commoditySet = new Set(
      (order.items || [])
        .map((row) => String(row?.item?.commodity || '').trim().toLowerCase())
        .filter(Boolean)
    );

    commoditySet.forEach((commodity) => {
      const key = getWalkCountLookupKey({ employeeId, startedAt, commodity });
      if (!key) {
        return;
      }

      const orderIds = lookup.get(key) || new Set();
      orderIds.add(Number(order.id));
      lookup.set(key, orderIds);
    });
  });

  return new Map(Array.from(lookup.entries()).map(([key, valueSet]) => [key, valueSet.size]));
};

const buildWalkHistory = (orders) => {
  const walkMap = new Map();

  orders.forEach((order) => {
    const startedAt = order?.pickingStartTime;
    const endedAt = order?.pickingEndTime;

    if (!startedAt || !endedAt) {
      return;
    }

    const commodityTotals = new Map();

    (order.items || []).forEach((orderItem) => {
      const commodity = orderItem?.item?.commodity;
      if (!commodity) {
        return;
      }

      const currentTotals = commodityTotals.get(commodity) || {
        initialTotal: 0,
        itemsPicked: 0
      };

      currentTotals.initialTotal += Math.max(0, toNumber(orderItem.quantity));
      currentTotals.itemsPicked += Math.max(0, toNumber(orderItem.pickedQuantity));
      commodityTotals.set(commodity, currentTotals);
    });

    commodityTotals.forEach((totals, commodity) => {
      const walkKey = `${new Date(startedAt).toISOString()}::${commodity}`;
      const existingWalk = walkMap.get(walkKey) || {
        employeeId: order?.assignedPickerId,
        commodity,
        commodityLabel: COMMODITY_DISPLAY_NAMES[commodity] || commodity,
        startedAt,
        endedAt,
        initialTotal: 0,
        itemsPicked: 0,
        orderCount: 0
      };

      existingWalk.initialTotal += totals.initialTotal;
      existingWalk.itemsPicked += totals.itemsPicked;
      existingWalk.orderCount += 1;

      if (new Date(endedAt) > new Date(existingWalk.endedAt)) {
        existingWalk.endedAt = endedAt;
      }

      walkMap.set(walkKey, existingWalk);
    });
  });

  return Array.from(walkMap.values())
    .map((walk) => {
      const durationHours = getWalkDurationHours(walk.startedAt, walk.endedAt);
      const pickRate = durationHours > 0 ? walk.itemsPicked / durationHours : 0;
      const walkKey = makeWalkKey({
        employeeId: walk.employeeId,
        startedAt: walk.startedAt,
        commodity: walk.commodity
      });
      const firstTimePickRate = walkKey ? getWalkFtprByKey(walkKey) : 0;

      return {
        commodity: walk.commodity,
        commodityLabel: walk.commodityLabel,
        startedAt: walk.startedAt,
        endedAt: walk.endedAt,
        initialTotal: walk.initialTotal,
        itemsPicked: walk.itemsPicked,
        orderCount: walk.orderCount,
        pickRate: Number(pickRate.toFixed(2)),
        firstTimePickRate: Number(firstTimePickRate.toFixed(2))
      };
    })
    .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt));
};

const mapSummaryToWalkHistory = (walkSummary, orderCountLookup = new Map()) => {
  const startedAt = walkSummary?.startedAt;
  const endedAt = walkSummary?.endedAt;
  const totalQuantity = Math.max(0, toNumber(walkSummary?.totalQuantity));
  const pickedQuantity = Math.max(0, toNumber(walkSummary?.pickedQuantity));
  const durationHours = getWalkDurationHours(startedAt, endedAt || startedAt);
  const pickRate = durationHours > 0 ? pickedQuantity / durationHours : 0;
  const commodity = String(walkSummary?.commodity || '').trim().toLowerCase();
  const summaryOrderCount = Math.max(0, Math.round(toNumber(walkSummary?.orderCount)));
  const lookupKey = getWalkCountLookupKey({
    employeeId: walkSummary?.employeeId,
    startedAt,
    commodity
  });
  const lookupOrderCount = lookupKey ? Math.max(0, Math.round(toNumber(orderCountLookup.get(lookupKey)))) : 0;
  const orderCount = summaryOrderCount > 0
    ? summaryOrderCount
    : (lookupOrderCount > 0 ? lookupOrderCount : (totalQuantity > 0 ? 1 : 0));

  return {
    commodity,
    commodityLabel: COMMODITY_DISPLAY_NAMES[commodity] || commodity || 'Commodity',
    startedAt,
    endedAt,
    initialTotal: totalQuantity,
    itemsPicked: pickedQuantity,
    orderCount,
    pickRate: Number(pickRate.toFixed(2)),
    firstTimePickRate: Number(toNumber(walkSummary?.firstTimePickRate).toFixed(2))
  };
};

const getCompletedPickWalkHistory = async (employeeIds) => {
  const normalizedEmployeeIds = Array.isArray(employeeIds)
    ? employeeIds.map((employeeId) => Number(employeeId)).filter(Number.isFinite)
    : [Number(employeeIds)].filter(Number.isFinite);

  if (normalizedEmployeeIds.length === 0) {
    return [];
  }

  const summaries = normalizedEmployeeIds
    .flatMap((employeeId) => getWalkSummariesForEmployee(employeeId, { closedOnly: true })
      .map((summary) => ({
        ...summary,
        employeeId
      })))
    .filter((summary) => summary?.startedAt);

  if (summaries.length > 0) {
    const orderCountLookup = await buildOrderCountLookup(summaries);

    return summaries
      .map((summary) => mapSummaryToWalkHistory(summary, orderCountLookup))
      .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt));
  }

  const where = {
    assignedPickerId: normalizedEmployeeIds.length === 1
      ? normalizedEmployeeIds[0]
      : { [Op.in]: normalizedEmployeeIds },
    pickingStartTime: { [Op.ne]: null },
    pickingEndTime: { [Op.ne]: null }
  };

  const orders = await Order.findAll({
    where,
    attributes: ['id', 'assignedPickerId', 'pickingStartTime', 'pickingEndTime'],
    include: [
      {
        model: OrderItem,
        as: 'items',
        required: true,
        attributes: ['id', 'quantity', 'pickedQuantity'],
        include: [
          {
            model: Item,
            as: 'item',
            required: true,
            attributes: ['commodity']
          }
        ]
      }
    ],
    order: [['pickingStartTime', 'DESC']]
  });

  return buildWalkHistory(orders);
};

const calculateAverageWalkPickRate = (walkHistory) => {
  if (!Array.isArray(walkHistory) || walkHistory.length === 0) {
    return 0;
  }

  const totalRate = walkHistory.reduce((sum, walk) => sum + toNumber(walk?.pickRate), 0);
  return Number((totalRate / walkHistory.length).toFixed(2));
};

/**
 * Calculate the derived performance metrics for a picker based on their assigned orders.
 *
 * This function is intentionally conservative: it never produces negative values,
 * and it keeps percentage values in the 0-100 range.
 */
const calculateEmployeeMetrics = async (employeeId) => {
  const employee = await Employee.findByPk(employeeId);
  if (!employee) {
    throw new Error(`Employee not found: ${employeeId}`);
  }

  // All order items for orders assigned to this employee as a picker
  const orderItems = await OrderItem.findAll({
    include: [
      {
        model: Order,
        as: 'order',
        where: { assignedPickerId: employeeId },
        attributes: []
      }
    ]
  });

  const pickedItems = orderItems.filter((item) => ['found', 'substituted'].includes(item.status));
  const totalPicks = pickedItems.length;
  const walkSummaries = getWalkSummariesForEmployee(employeeId, { closedOnly: true });
  const totalWalkQuantity = walkSummaries.reduce((sum, walk) => sum + toNumber(walk?.totalQuantity), 0);
  const originalPickedQuantity = walkSummaries.reduce((sum, walk) => sum + toNumber(walk?.originalPickedQuantity), 0);
  const substitutedQuantity = walkSummaries.reduce((sum, walk) => sum + toNumber(walk?.substitutedQuantity), 0);
  const ftprMistakeQuantity = walkSummaries.reduce((sum, walk) => sum + toNumber(walk?.ftprMistakeQuantity), 0);
  const firstTimePickPercent = totalWalkQuantity === 0
    ? 0
    : ((Math.max(0, totalWalkQuantity - ftprMistakeQuantity)) / totalWalkQuantity) * 100;
  const preSubstitutionPercent = totalWalkQuantity === 0
    ? 0
    : (originalPickedQuantity / totalWalkQuantity) * 100;
  const postSubstitutionPercent = totalWalkQuantity === 0
    ? 0
    : ((originalPickedQuantity + substitutedQuantity) / totalWalkQuantity) * 100;
  const notFoundQuantity = walkSummaries.reduce((sum, walk) => sum + toNumber(walk?.mistakeQuantity), 0);
  const percentNotFound = totalWalkQuantity === 0 ? 0 : (notFoundQuantity / totalWalkQuantity) * 100;

  // On-time percentage: compare actual pickup vs scheduled pickup for orders that have been picked up.
  const orders = await Order.findAll({
    where: {
      assignedPickerId: employeeId,
      actualPickupTime: {
        [Op.ne]: null
      }
    },
    attributes: ['scheduledPickupTime', 'actualPickupTime']
  });

  const onTimeCount = orders.filter((order) => order.actualPickupTime <= order.scheduledPickupTime).length;
  const onTimePercent = orders.length === 0 ? 0 : (onTimeCount / orders.length) * 100;

  const weightedEfficiency =
    totalPicks === 0
      ? 0
      : (firstTimePickPercent + preSubstitutionPercent + (100 - percentNotFound)) / 3;

  const walkHistory = await getCompletedPickWalkHistory(employeeId);

  return {
    pickRate: calculateAverageWalkPickRate(walkHistory),
    itemsPicked: Math.max(0, totalPicks),
    firstTimePickPercent: clampPercent(firstTimePickPercent),
    preSubstitutionPercent: clampPercent(preSubstitutionPercent),
    postSubstitutionPercent: clampPercent(postSubstitutionPercent),
    percentNotFound: clampPercent(percentNotFound),
    onTimePercent: clampPercent(onTimePercent),
    weightedEfficiency: clampPercent(weightedEfficiency)
  };
};

const updateEmployeeMetrics = async (employeeId) => {
  const metrics = await calculateEmployeeMetrics(employeeId);
  await Employee.update(metrics, { where: { id: employeeId } });
  return metrics;
};

module.exports = {
  calculateAverageWalkPickRate,
  calculateEmployeeMetrics,
  getCompletedPickWalkHistory,
  updateEmployeeMetrics
};
