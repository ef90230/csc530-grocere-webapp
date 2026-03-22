const { Employee, Order, OrderItem } = require('../models');
const { Op } = require('sequelize');

const clampPercent = (value) => {
  if (value == null || isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Number(value)));
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

  return {
    pickRate: Math.max(0, totalPicks),
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
  calculateEmployeeMetrics,
  updateEmployeeMetrics
};
