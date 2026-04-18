const { Employee, Item, ItemLocation, Order } = require('../models');
const {
  createAlert,
  dismissAlert,
  listAlerts,
  upsertAlertBySourceKey
} = require('../utils/alertStore');

const isAdminRequest = (req) => req.authType === 'admin';

const toIntegerOrNull = (value) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
};

const getStoreIdFromRequest = (req) => {
  const storeId = toIntegerOrNull(req?.user?.storeId);
  return storeId && storeId > 0 ? storeId : null;
};

const normalizeSort = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['newest', 'oldest', 'type'].includes(normalized) ? normalized : 'newest';
};

const normalizeSearch = (value) => String(value || '').trim().toLowerCase();

const PICK_WALK_REPORT_DEFINITIONS = {
  item_cannot_fit: {
    type: 'item_report',
    subtype: 'cannot_fit',
    title: 'Cannot Fit',
    actionLabel: 'Item Info'
  },
  wrong_temperature_type: {
    type: 'item_report',
    subtype: 'wrong_temp',
    title: 'Wrong Temp',
    actionLabel: 'Item Info'
  },
  remove_from_oversized: {
    type: 'item_report',
    subtype: 'not_oversized',
    title: 'Not Oversized',
    actionLabel: 'Item Info'
  },
  item_locked_in_case: {
    type: 'item_report',
    subtype: 'locked',
    title: 'Locked',
    actionLabel: 'Item Info'
  },
  remove_from_restricted: {
    type: 'item_report',
    subtype: 'not_restricted',
    title: 'Not Restricted',
    actionLabel: 'Item Info'
  },
  incorrect_item_info: {
    type: 'item_report',
    subtype: 'wrong_info',
    title: 'Wrong Info',
    actionLabel: 'Item Info'
  },
  item_appeared_out_of_order: {
    type: 'map_report',
    subtype: 'out_of_order',
    title: 'Out of Order',
    actionLabel: 'Store Map'
  }
};

const syncOverdueCommodityAlerts = async (storeId) => {
  if (!storeId) {
    return;
  }

  const { OrderItem, Item: OrderItemItem } = require('../models');
  const { Op } = require('sequelize');

  const now = new Date();
  const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const orders = await Order.findAll({
    where: {
      storeId,
      status: 'pending',
      scheduledPickupTime: {
        [Op.lte]: threeHoursFromNow
      }
    },
    attributes: ['id', 'scheduledPickupTime'],
    include: [
      {
        model: OrderItem,
        as: 'items',
        required: true,
        where: {
          status: 'pending'
        },
        attributes: ['id', 'quantity', 'pickedQuantity'],
        include: [
          {
            model: OrderItemItem,
            as: 'item',
            attributes: ['commodity']
          }
        ]
      }
    ]
  });

  const earliestDueByCommodity = new Map();
  orders.forEach((order) => {
    (order.items || []).forEach((orderItem) => {
      const commodity = String(orderItem?.item?.commodity || '').trim().toLowerCase();
      if (!commodity) {
        return;
      }

      const existingDue = earliestDueByCommodity.get(commodity);
      const dueAt = new Date(order.scheduledPickupTime);
      if (!existingDue || dueAt < existingDue) {
        earliestDueByCommodity.set(commodity, dueAt);
      }
    });
  });

  earliestDueByCommodity.forEach((dueAt, commodity) => {
    if (dueAt >= now) {
      return;
    }

    upsertAlertBySourceKey({
      type: 'picks_overdue',
      subtype: commodity,
      title: 'Picks went overdue',
      subject: commodity,
      message: commodity,
      actionLabel: 'Pick List',
      actionTarget: {
        path: '/commodityselect'
      },
      icon: 'warning',
      severity: 'critical',
      storeId,
      sourceKey: `picks_overdue:${storeId}:${commodity}`
    });
  });
};

const listAdminAlerts = async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({ message: 'Only admins can view alerts.' });
    }

    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid admin store is required.' });
    }

    await syncOverdueCommodityAlerts(storeId);

    const search = normalizeSearch(req.query.search);
    const filterType = String(req.query.type || '').trim().toLowerCase();
    const sort = normalizeSort(req.query.sort);

    let alerts = listAlerts(storeId);
    if (filterType) {
      alerts = alerts.filter((alert) => alert.type === filterType);
    }

    if (search) {
      alerts = alerts.filter((alert) => (
        [alert.title, alert.subject, alert.message, alert.employeeName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search))
      ));
    }

    if (sort === 'oldest') {
      alerts = [...alerts].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
    } else if (sort === 'type') {
      alerts = [...alerts].sort((left, right) => {
        const typeCompare = String(left.type).localeCompare(String(right.type));
        if (typeCompare !== 0) {
          return typeCompare;
        }
        return new Date(right.createdAt) - new Date(left.createdAt);
      });
    }

    return res.json({
      success: true,
      count: alerts.length,
      alerts
    });
  } catch (error) {
    console.error('List admin alerts error:', error);
    return res.status(500).json({ message: 'Server error retrieving alerts' });
  }
};

const createEmployeeCommentAlert = async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ message: 'Comment text is required.' });
    }

    const employeeId = toIntegerOrNull(req.user?.id);
    const employee = employeeId ? await Employee.findByPk(employeeId, {
      attributes: ['id', 'firstName', 'lastName']
    }) : null;
    const employeeName = employee
      ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim()
      : 'Employee';

    const alert = createAlert({
      type: 'employee_comment',
      title: 'Employee comment',
      subject: employeeName,
      message,
      storeId,
      employeeId,
      employeeName,
      severity: 'neutral'
    });

    return res.status(201).json({
      success: true,
      alert
    });
  } catch (error) {
    console.error('Create employee comment alert error:', error);
    return res.status(500).json({ message: 'Server error creating comment alert' });
  }
};

const createPickWalkReportAlerts = async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const reportTypes = Array.isArray(req.body?.reportTypes)
      ? req.body.reportTypes.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [];

    if (reportTypes.length === 0) {
      return res.status(400).json({ message: 'At least one report type must be selected.' });
    }

    const invalidType = reportTypes.find((reportType) => !PICK_WALK_REPORT_DEFINITIONS[reportType]);
    if (invalidType) {
      return res.status(400).json({ message: `Invalid report type: ${invalidType}` });
    }

    const employeeId = toIntegerOrNull(req.user?.id);
    const employee = employeeId ? await Employee.findByPk(employeeId, {
      attributes: ['id', 'firstName', 'lastName']
    }) : null;
    const employeeName = employee
      ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim()
      : 'Employee';

    const itemId = toIntegerOrNull(req.body?.itemId);
    const orderId = toIntegerOrNull(req.body?.orderId);
    const itemName = String(req.body?.itemName || '').trim() || 'Item Name';
    const locationLabel = String(req.body?.locationLabel || '').trim() || 'Pick walk';

    const alerts = reportTypes.map((reportType) => {
      const definition = PICK_WALK_REPORT_DEFINITIONS[reportType];
      const actionTarget = definition.type === 'map_report'
        ? createMapActionTarget()
        : createItemActionTarget(itemId);

      return createAlert({
        type: definition.type,
        subtype: definition.subtype,
        title: definition.title,
        subject: itemName,
        message: locationLabel,
        actionLabel: definition.actionLabel,
        actionTarget,
        severity: 'warning',
        storeId,
        itemId,
        orderId,
        employeeId,
        employeeName,
        metadata: {
          reportType,
          source: 'pick_walk',
          locationLabel
        }
      });
    });

    return res.status(201).json({
      success: true,
      count: alerts.length,
      alerts
    });
  } catch (error) {
    console.error('Create pick walk report alerts error:', error);
    return res.status(500).json({ message: 'Server error creating report alerts' });
  }
};

const dismissAdminAlert = async (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({ message: 'Only admins can dismiss alerts.' });
    }

    const removed = dismissAlert(req.params.id);
    if (!removed) {
      return res.status(404).json({ message: 'Alert not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Dismiss admin alert error:', error);
    return res.status(500).json({ message: 'Server error dismissing alert' });
  }
};

const createSystemAlert = (input = {}) => createAlert(input);
const upsertSystemAlert = (input = {}) => upsertAlertBySourceKey(input);

const createItemActionTarget = (itemId) => ({
  path: '/inventory',
  state: {
    focusItemId: itemId
  }
});

const createOrderActionTarget = (orderId) => ({
  path: '/orders',
  state: {
    focusOrderId: orderId
  }
});

const createMapActionTarget = () => ({
  path: '/map'
});

const createLeaderboardActionTarget = () => ({
  path: '/leaderboard'
});

const createPickListActionTarget = () => ({
  path: '/commodityselect'
});

const createOrderCanceledAlert = async ({ orderId, orderNumber, storeId }) => {
  const resolvedStoreId = toIntegerOrNull(storeId);
  if (!resolvedStoreId) {
    return null;
  }

  return createSystemAlert({
    type: 'order_canceled',
    title: 'Order canceled',
    subject: orderNumber || 'Order Number',
    message: orderNumber || 'Order Number',
    actionLabel: 'Order List',
    actionTarget: createOrderActionTarget(orderId),
    icon: 'warning',
    severity: 'critical',
    storeId: resolvedStoreId,
    orderId: toIntegerOrNull(orderId)
  });
};

const createPickerExitedWalkAlert = async ({ employeeId, employeeName, storeId }) => {
  const resolvedStoreId = toIntegerOrNull(storeId);
  if (!resolvedStoreId) {
    return null;
  }

  return createSystemAlert({
    type: 'picker_alert',
    subtype: 'walk_ended_early',
    title: 'Picker exited walk early',
    subject: employeeName || 'Employee Name',
    message: employeeName || 'Employee Name',
    actionLabel: 'Leaderboard',
    actionTarget: createLeaderboardActionTarget(),
    severity: 'warning',
    storeId: resolvedStoreId,
    employeeId: toIntegerOrNull(employeeId),
    employeeName: employeeName || ''
  });
};

const createOutOfStockAlerts = async ({ itemId, itemName, storeId, locationLabel, locationHitZero, overallHitZero }) => {
  const resolvedStoreId = toIntegerOrNull(storeId);
  const resolvedItemId = toIntegerOrNull(itemId);
  if (!resolvedStoreId || !resolvedItemId) {
    return [];
  }

  const alerts = [];

  if (locationHitZero && locationLabel) {
    alerts.push(upsertSystemAlert({
      type: 'out_of_stock',
      subtype: 'location_zero',
      title: `On Hand at Location ${locationLabel} hit 0`,
      subject: itemName || 'Item Name',
      message: itemName || 'Item Name',
      actionLabel: 'Item Info',
      actionTarget: createItemActionTarget(resolvedItemId),
      severity: 'critical',
      storeId: resolvedStoreId,
      itemId: resolvedItemId,
      sourceKey: `out_of_stock:location:${resolvedStoreId}:${resolvedItemId}:${locationLabel}`
    }));
  }

  if (overallHitZero) {
    alerts.push(upsertSystemAlert({
      type: 'out_of_stock',
      subtype: 'overall_zero',
      title: 'On Hand overall hit 0',
      subject: itemName || 'Item Name',
      message: itemName || 'Item Name',
      actionLabel: 'Item Info',
      actionTarget: createItemActionTarget(resolvedItemId),
      severity: 'critical',
      storeId: resolvedStoreId,
      itemId: resolvedItemId,
      sourceKey: `out_of_stock:overall:${resolvedStoreId}:${resolvedItemId}`
    }));
  }

  return alerts;
};

const syncItemOutOfStockAlerts = async ({ itemId, storeId, locationLabel = '', locationQuantity = null }) => {
  const resolvedStoreId = toIntegerOrNull(storeId);
  const resolvedItemId = toIntegerOrNull(itemId);
  if (!resolvedStoreId || !resolvedItemId) {
    return [];
  }

  const item = await Item.findByPk(resolvedItemId, {
    attributes: ['id', 'name', 'unassignedQuantity']
  });

  if (!item) {
    return [];
  }

  const itemLocations = await ItemLocation.findAll({
    where: {
      itemId: resolvedItemId,
      storeId: resolvedStoreId
    },
    attributes: ['quantityOnHand']
  });

  const totalAssigned = itemLocations.reduce((sum, row) => sum + Math.max(0, Number(row.quantityOnHand || 0)), 0);
  const totalOnHand = totalAssigned + Math.max(0, Number(item.unassignedQuantity || 0));

  return createOutOfStockAlerts({
    itemId: resolvedItemId,
    itemName: item.name,
    storeId: resolvedStoreId,
    locationLabel,
    locationHitZero: Boolean(locationLabel) && Number(locationQuantity) === 0,
    overallHitZero: totalOnHand === 0
  });
};

const getItemDisplayName = async (itemId) => {
  const resolvedItemId = toIntegerOrNull(itemId);
  if (!resolvedItemId) {
    return 'Item Name';
  }

  const item = await Item.findByPk(resolvedItemId, { attributes: ['id', 'name'] });
  return item?.name || 'Item Name';
};

module.exports = {
  createPickWalkReportAlerts,
  createEmployeeCommentAlert,
  createItemActionTarget,
  createMapActionTarget,
  createOrderCanceledAlert,
  createOutOfStockAlerts,
  createPickListActionTarget,
  createPickerExitedWalkAlert,
  createSystemAlert,
  dismissAdminAlert,
  getItemDisplayName,
  listAdminAlerts,
  syncItemOutOfStockAlerts,
  upsertSystemAlert
};