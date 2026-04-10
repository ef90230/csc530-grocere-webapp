const { Op, fn, col, where } = require('sequelize');
const {
  sequelize,
  StagingLocation,
  StagingAssignment,
  StagingLocationSetting,
  Order,
  OrderItem,
  Item,
  Customer,
  Employee
} = require('../models');
const { applyTotesDelta } = require('../utils/employeeTotesHistoryStore');

const ALLOWED_ITEM_TYPES = ['ambient', 'chilled', 'frozen', 'hot', 'oversized'];
const INACTIVE_ORDER_STATUSES = ['dispensing', 'completed', 'cancelled'];

const COMMODITY_DISPLAY_NAMES = {
  ambient: 'Ambient',
  chilled: 'Chilled',
  frozen: 'Frozen',
  hot: 'Hot',
  oversized: 'Oversized'
};

const normalizeItemType = (value) => String(value || '').trim().toLowerCase();

const parseLocationId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const getStoreIdFromRequest = (req) => {
  const storeId = Number(req?.user?.storeId);
  return Number.isInteger(storeId) ? storeId : null;
};

const getOrCreateStoreSettings = async (storeId) => {
  const [settings] = await StagingLocationSetting.findOrCreate({
    where: { storeId },
    defaults: {
      storeId,
      stagingLimit: 10
    }
  });

  return settings;
};

const updateEmployeeTotesStaged = async (employeeId, storeId, delta, transaction) => {
  const resolvedEmployeeId = Number(employeeId);

  if (!Number.isInteger(resolvedEmployeeId) || !Number.isInteger(delta) || delta === 0) {
    return;
  }

  const employee = await Employee.findOne({
    where: {
      id: resolvedEmployeeId,
      storeId
    },
    transaction
  });

  if (!employee) {
    return;
  }

  const nextValue = Math.max(0, Number(employee.totesStaged || 0) + delta);
  await employee.update({ totesStaged: nextValue }, { transaction });
  applyTotesDelta(resolvedEmployeeId, delta);
};

const getActiveAssignmentRows = async (storeId, extraWhere = {}) => {
  return StagingAssignment.findAll({
    where: {
      storeId,
      ...extraWhere
    },
    include: [
      {
        model: Order,
        as: 'order',
        required: true,
        attributes: ['id', 'orderNumber', 'status', 'scheduledPickupTime'],
        where: {
          status: {
            [Op.notIn]: INACTIVE_ORDER_STATUSES
          }
        },
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['firstName', 'lastName'],
            required: false
          }
        ]
      },
      {
        model: StagingLocation,
        as: 'stagingLocation',
        required: false,
        attributes: ['id', 'name', 'itemType', 'stagingLimit']
      }
    ],
    order: [[{ model: Order, as: 'order' }, 'scheduledPickupTime', 'ASC']]
  });
};

const getLocations = async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const settings = await getOrCreateStoreSettings(storeId);

    const locations = await StagingLocation.findAll({
      where: { storeId },
      order: [['itemType', 'ASC'], ['name', 'ASC']]
    });

    const activeAssignments = await getActiveAssignmentRows(storeId);
    const toteCountByLocationId = new Map();

    activeAssignments.forEach((assignment) => {
      const locationId = assignment?.stagingLocationId;
      if (!locationId) {
        return;
      }

      const currentCount = toteCountByLocationId.get(locationId) || 0;
      toteCountByLocationId.set(locationId, currentCount + 1);
    });

    const locationPayload = locations.map((location) => {
      const toteCount = toteCountByLocationId.get(location.id) || 0;
      return {
        ...location.toJSON(),
        toteCount
      };
    });

    const maxToteCount = locationPayload.reduce(
      (currentMax, location) => Math.max(currentMax, Number(location.toteCount || 0)),
      0
    );

    return res.json({
      success: true,
      count: locationPayload.length,
      currentLimit: Number(settings.stagingLimit || 10),
      minimumAllowedLimit: Math.max(maxToteCount, 1),
      locations: locationPayload
    });
  } catch (error) {
    console.error('Get staging locations error:', error);
    return res.status(500).json({ message: 'Server error retrieving staging locations' });
  }
};

const getAssignments = async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const assignments = await getActiveAssignmentRows(storeId);

    return res.json({
      success: true,
      count: assignments.length,
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        orderId: assignment.orderId,
        commodity: assignment.commodity,
        commodityLabel: COMMODITY_DISPLAY_NAMES[assignment.commodity] || assignment.commodity,
        stagingLocationId: assignment.stagingLocationId,
        stagingLocation: assignment.stagingLocation
          ? {
            id: assignment.stagingLocation.id,
            name: assignment.stagingLocation.name,
            itemType: assignment.stagingLocation.itemType,
            stagingLimit: assignment.stagingLocation.stagingLimit
          }
          : null
      }))
    });
  } catch (error) {
    console.error('Get staging assignments error:', error);
    return res.status(500).json({ message: 'Server error retrieving staging assignments' });
  }
};

const createLocation = async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const name = String(req.body?.name || '').trim();
    const itemType = normalizeItemType(req.body?.itemType);

    if (!name) {
      return res.status(400).json({ message: 'Location name is required.' });
    }

    if (!ALLOWED_ITEM_TYPES.includes(itemType)) {
      return res.status(400).json({ message: 'itemType must be one of ambient, chilled, frozen, hot, or oversized.' });
    }

    const existing = await StagingLocation.findOne({
      where: {
        storeId,
        [Op.and]: [where(fn('lower', col('name')), name.toLowerCase())]
      }
    });

    if (existing) {
      return res.status(409).json({ message: 'A staging location with this name already exists for your store.' });
    }

    const settings = await getOrCreateStoreSettings(storeId);

    const location = await StagingLocation.create({
      storeId,
      name,
      itemType,
      stagingLimit: Number(settings.stagingLimit || 10)
    });

    return res.status(201).json({
      success: true,
      location
    });
  } catch (error) {
    console.error('Create staging location error:', error);
    return res.status(500).json({ message: 'Server error creating staging location' });
  }
};

const updateLocationOptions = async (req, res) => {
  let transaction;
  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const parsedLimit = Number(req.body?.stagingLimit);

    if (!Number.isInteger(parsedLimit)) {
      return res.status(400).json({ message: 'stagingLimit must be an integer.' });
    }

    if (parsedLimit > 50) {
      return res.status(400).json({ message: 'stagingLimit cannot exceed 50.' });
    }

    const activeAssignments = await getActiveAssignmentRows(storeId);
    const maxToteCount = activeAssignments.reduce((counts, assignment) => {
      const locationId = assignment?.stagingLocationId;
      if (!locationId) {
        return counts;
      }
      counts[locationId] = (counts[locationId] || 0) + 1;
      return counts;
    }, {});

    const mostLoadedLocationCount = Math.max(
      0,
      ...Object.values(maxToteCount).map((count) => Number(count || 0))
    );
    const minimumAllowedLimit = Math.max(mostLoadedLocationCount, 1);

    if (parsedLimit < minimumAllowedLimit) {
      return res.status(400).json({
        message: `stagingLimit cannot be less than ${minimumAllowedLimit} while totes are staged.`
      });
    }

    transaction = await sequelize.transaction();

    const [settings] = await StagingLocationSetting.findOrCreate({
      where: { storeId },
      defaults: {
        storeId,
        stagingLimit: 10
      },
      transaction
    });

    await settings.update({ stagingLimit: parsedLimit }, { transaction });

    await StagingLocation.update(
      { stagingLimit: parsedLimit },
      {
        where: { storeId },
        transaction
      }
    );

    await transaction.commit();

    return res.json({
      success: true,
      currentLimit: parsedLimit,
      minimumAllowedLimit
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('Staging options rollback warning:', rollbackError.message);
      }
    }
    console.error('Update staging options error:', error);
    return res.status(500).json({ message: 'Server error updating staging options' });
  }
};

const updateLocation = async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const locationId = parseLocationId(req.params.id);
    if (!locationId) {
      return res.status(400).json({ message: 'A valid location id is required.' });
    }

    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Location name is required.' });
    }

    const location = await StagingLocation.findOne({
      where: {
        id: locationId,
        storeId
      }
    });

    if (!location) {
      return res.status(404).json({ message: 'Staging location not found.' });
    }

    const duplicate = await StagingLocation.findOne({
      where: {
        storeId,
        id: {
          [Op.ne]: location.id
        },
        [Op.and]: [where(fn('lower', col('name')), name.toLowerCase())]
      }
    });

    if (duplicate) {
      return res.status(409).json({ message: 'A staging location with this name already exists for your store.' });
    }

    await location.update({ name });

    return res.json({
      success: true,
      location
    });
  } catch (error) {
    console.error('Update staging location error:', error);
    return res.status(500).json({ message: 'Server error updating staging location' });
  }
};

const deleteLocation = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const locationId = parseLocationId(req.params.id);
    if (!locationId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'A valid location id is required.' });
    }

    const location = await StagingLocation.findOne({
      where: {
        id: locationId,
        storeId
      },
      transaction
    });

    if (!location) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Staging location not found.' });
    }

    const activeAssignments = await getActiveAssignmentRows(storeId, { stagingLocationId: location.id });

    if (activeAssignments.length > 0) {
      await transaction.rollback();
      return res.status(409).json({ message: 'This location cannot be deleted while it contains staged totes.' });
    }

    await StagingAssignment.destroy({
      where: {
        storeId,
        stagingLocationId: location.id
      },
      transaction
    });

    await location.destroy({ transaction });

    await transaction.commit();

    return res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete staging location error:', error);
    return res.status(500).json({ message: 'Server error deleting staging location' });
  }
};

const assignGroup = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const orderId = Number(req.body?.orderId);
    const stagingLocationId = Number(req.body?.stagingLocationId);
    const commodity = normalizeItemType(req.body?.commodity);

    if (!Number.isInteger(orderId) || !Number.isInteger(stagingLocationId)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'orderId and stagingLocationId must be valid integers.' });
    }

    if (!ALLOWED_ITEM_TYPES.includes(commodity)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'commodity must be one of ambient, chilled, frozen, hot, or oversized.' });
    }

    const location = await StagingLocation.findOne({
      where: {
        id: stagingLocationId,
        storeId
      },
      transaction
    });

    if (!location) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Staging location not found.' });
    }

    if (location.itemType !== commodity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Location type must match the item group type.' });
    }

    const order = await Order.findOne({
      where: {
        id: orderId,
        storeId
      },
      transaction
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Order not found.' });
    }

    const hasCommodityItems = await OrderItem.findOne({
      where: { orderId },
      include: [
        {
          model: Item,
          as: 'item',
          required: true,
          where: {
            commodity
          }
        }
      ],
      transaction
    });

    if (!hasCommodityItems) {
      await transaction.rollback();
      return res.status(400).json({ message: 'The selected order does not contain this item group.' });
    }

    const existingAssignment = await StagingAssignment.findOne({
      where: {
        storeId,
        orderId,
        commodity
      },
      transaction
    });

    const activeAssignmentsForLocation = await getActiveAssignmentRows(storeId, { stagingLocationId });
    const consumedSlots = activeAssignmentsForLocation.filter((assignment) => {
      if (!existingAssignment) {
        return true;
      }

      return assignment.id !== existingAssignment.id;
    }).length;

    if (consumedSlots >= Number(location.stagingLimit || 0)) {
      await transaction.rollback();
      return res.status(409).json({ message: `Location ${location.name} is full.` });
    }

    if (existingAssignment) {
      await existingAssignment.update({ stagingLocationId }, { transaction });
      await transaction.commit();
      return res.json({
        success: true,
        assignment: existingAssignment
      });
    }

    const assignment = await StagingAssignment.create({
      storeId,
      orderId,
      commodity,
      stagingLocationId
    }, { transaction });

    await updateEmployeeTotesStaged(req?.user?.id, storeId, 1, transaction);

    await transaction.commit();

    return res.status(201).json({
      success: true,
      assignment
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Assign staging group error:', error);
    return res.status(500).json({ message: 'Server error assigning staged item group' });
  }
};

const unassignGroup = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const orderId = Number(req.body?.orderId);
    const commodity = normalizeItemType(req.body?.commodity);

    if (!Number.isInteger(orderId)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'orderId must be a valid integer.' });
    }

    if (!ALLOWED_ITEM_TYPES.includes(commodity)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'commodity must be one of ambient, chilled, frozen, hot, or oversized.' });
    }

    const removedCount = await StagingAssignment.destroy({
      where: {
        storeId,
        orderId,
        commodity
      },
      transaction
    });

    if (removedCount > 0) {
      await updateEmployeeTotesStaged(req?.user?.id, storeId, -1, transaction);
    }

    await transaction.commit();

    return res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    console.error('Unassign staging group error:', error);
    return res.status(500).json({ message: 'Server error removing staged item group' });
  }
};

const getLocationTotes = async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const locationId = parseLocationId(req.params.id);
    if (!locationId) {
      return res.status(400).json({ message: 'A valid location id is required.' });
    }

    const location = await StagingLocation.findOne({
      where: {
        id: locationId,
        storeId
      }
    });

    if (!location) {
      return res.status(404).json({ message: 'Staging location not found.' });
    }

    const assignments = await getActiveAssignmentRows(storeId, { stagingLocationId: locationId });

    const totes = assignments.map((assignment) => {
      const customerFirst = assignment?.order?.customer?.firstName || '';
      const customerLast = assignment?.order?.customer?.lastName || '';
      const customerName = `${customerFirst} ${customerLast}`.trim() || 'Customer';

      return {
        id: assignment.id,
        orderId: assignment.orderId,
        orderNumber: assignment?.order?.orderNumber || `#${assignment.orderId}`,
        scheduledPickupTime: assignment?.order?.scheduledPickupTime || null,
        commodity: assignment.commodity,
        commodityLabel: COMMODITY_DISPLAY_NAMES[assignment.commodity] || assignment.commodity,
        customerName
      };
    });

    return res.json({
      success: true,
      location: {
        id: location.id,
        name: location.name,
        itemType: location.itemType,
        stagingLimit: location.stagingLimit
      },
      count: totes.length,
      totes
    });
  } catch (error) {
    console.error('Get location totes error:', error);
    return res.status(500).json({ message: 'Server error retrieving location totes' });
  }
};

const getOrderTotesSummary = async (req, res) => {
  try {
    const storeId = getStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'A valid employee store is required.' });
    }

    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ message: 'A valid order id is required.' });
    }

    const order = await Order.findOne({
      where: {
        id: orderId,
        storeId
      },
      attributes: ['id', 'orderNumber', 'status', 'scheduledPickupTime'],
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['firstName', 'lastName'],
          required: false
        },
        {
          model: OrderItem,
          as: 'items',
          attributes: ['id', 'status'],
          include: [
            {
              model: Item,
              as: 'item',
              attributes: ['commodity']
            }
          ]
        }
      ]
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const groupedOrderItems = new Map();
    (order.items || []).forEach((orderItem) => {
      const commodity = normalizeItemType(orderItem?.item?.commodity);
      if (!commodity) {
        return;
      }

      if (!groupedOrderItems.has(commodity)) {
        groupedOrderItems.set(commodity, []);
      }

      groupedOrderItems.get(commodity).push(orderItem);
    });

    const assignments = await StagingAssignment.findAll({
      where: {
        storeId,
        orderId
      },
      include: [
        {
          model: StagingLocation,
          as: 'stagingLocation',
          attributes: ['id', 'name', 'itemType'],
          required: false
        }
      ]
    });

    const assignmentByCommodity = assignments.reduce((accumulator, assignment) => {
      accumulator[assignment.commodity] = assignment;
      return accumulator;
    }, {});

    const orderStatus = normalizeItemType(order.status);

    const totes = Array.from(groupedOrderItems.entries())
      .map(([commodity, items]) => {
        const assignment = assignmentByCommodity[commodity] || null;
        const hasPendingItem = items.some((orderItem) => normalizeItemType(orderItem.status) === 'pending');

        let status = 'unstaged';

        if (assignment?.stagingLocation) {
          status = 'staged';
        } else if (hasPendingItem && orderStatus === 'picking') {
          status = 'picking';
        } else if (hasPendingItem) {
          status = 'not_yet_picked';
        }

        return {
          commodity,
          commodityLabel: COMMODITY_DISPLAY_NAMES[commodity] || commodity,
          status,
          stagingLocation: assignment?.stagingLocation
            ? {
              id: assignment.stagingLocation.id,
              name: assignment.stagingLocation.name,
              itemType: assignment.stagingLocation.itemType
            }
            : null
        };
      })
      .sort((left, right) => {
        const leftIndex = ALLOWED_ITEM_TYPES.indexOf(left.commodity);
        const rightIndex = ALLOWED_ITEM_TYPES.indexOf(right.commodity);

        if (leftIndex !== rightIndex) {
          return (leftIndex === -1 ? ALLOWED_ITEM_TYPES.length : leftIndex)
            - (rightIndex === -1 ? ALLOWED_ITEM_TYPES.length : rightIndex);
        }

        return left.commodityLabel.localeCompare(right.commodityLabel);
      });

    const customerName = `${order?.customer?.firstName || ''} ${order?.customer?.lastName || ''}`.trim() || 'Customer';

    return res.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName,
        scheduledPickupTime: order.scheduledPickupTime
      },
      count: totes.length,
      totes
    });
  } catch (error) {
    console.error('Get order totes summary error:', error);
    return res.status(500).json({ message: 'Server error retrieving order totes summary' });
  }
};

module.exports = {
  getLocations,
  getAssignments,
  createLocation,
  updateLocationOptions,
  updateLocation,
  deleteLocation,
  assignGroup,
  unassignGroup,
  getLocationTotes,
  getOrderTotesSummary
};