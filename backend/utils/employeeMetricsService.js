const { Employee, Item, Order, OrderItem } = require('../models');
const { Op } = require('sequelize');

const COMMODITY_DISPLAY_NAMES = {
  ambient: 'Ambient Regular',
  chilled: 'Chilled Regular',
  frozen: 'Frozen Regular',
  hot: 'Hot Regular',
  oversized: 'Oversized',
  restricted: 'Team Lift'
};

const toNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const clampPercent = (value) => {
  if (value == null || isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Number(value)));
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

      return {
        commodity: walk.commodity,
        commodityLabel: walk.commodityLabel,
        startedAt: walk.startedAt,
        endedAt: walk.endedAt,
        initialTotal: walk.initialTotal,
        itemsPicked: walk.itemsPicked,
        orderCount: walk.orderCount,
        pickRate: Number(pickRate.toFixed(2))
      };
    })
    .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt));
};

const getCompletedPickWalkHistory = async (employeeIds) => {
  const normalizedEmployeeIds = Array.isArray(employeeIds)
    ? employeeIds.map((employeeId) => Number(employeeId)).filter(Number.isFinite)
    : [Number(employeeIds)].filter(Number.isFinite);

  if (normalizedEmployeeIds.length === 0) {
    return [];
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

  const totalItems = orderItems.length;
  const pickedItems = orderItems.filter((item) => ['found', 'substituted'].includes(item.status));
  const totalPicks = pickedItems.length;
  const firstTimePicks = pickedItems.filter((item) => item.foundOnFirstAttempt).length;
  const substituted = pickedItems.filter((item) => item.status === 'substituted').length;
  const notFound = orderItems.filter((item) => ['out_of_stock', 'skipped'].includes(item.status)).length;

  const firstTimePickPercent = totalPicks === 0 ? 0 : (firstTimePicks / totalPicks) * 100;
  const postSubstitutionPercent = totalPicks === 0 ? 0 : (substituted / totalPicks) * 100;
  // Pre-substitution percent is never allowed to exceed post-substitution percent.
  const preSubstitutionPercent = Math.min(postSubstitutionPercent, 100);
  const percentNotFound = totalItems === 0 ? 0 : (notFound / totalItems) * 100;

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
