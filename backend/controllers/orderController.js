const { Order, OrderItem, Customer, Store, Employee, Item, ItemLocation, PickPath, Location, Aisle, StagingAssignment } = require('../models');
const { Op, fn, col } = require('sequelize');
const {
  validateScheduleTime,
  getAvailableTimeSlots,
  getNextAvailableSlot,
  purgeOldSchedules
} = require('../utils/schedulingService');
const { updateEmployeeMetrics } = require('../utils/employeeMetricsService');

const COMMODITY_DISPLAY_NAMES = {
  ambient: 'Ambient Regular',
  chilled: 'Chilled Regular',
  frozen: 'Frozen Regular',
  hot: 'Hot Regular',
  oversized: 'Oversized',
  restricted: 'Team Lift'
};

const WALK_LOOKAHEAD_HOURS = 3;

const parseStructuredOrderNotes = (notesValue) => {
  if (!notesValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(notesValue);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const extractOrderCheckIn = (notesValue) => {
  const parsedOrderNotes = parseStructuredOrderNotes(notesValue);
  const checkIn = parsedOrderNotes?.checkIn;

  return {
    isCheckedIn: Boolean(checkIn?.isCheckedIn),
    checkInTime: checkIn?.checkInTime || null,
    parkingSpot: checkIn?.parkingSpot || null,
    vehicleInfo: checkIn?.vehicleInfo || null
  };
};

const toAisleNumberValue = (aisleNumber) => {
  const numeric = Number(aisleNumber);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
};

const finalizeOrderIfResolved = async (orderId) => {
  if (!orderId) {
    return null;
  }

  const order = await Order.findByPk(orderId);
  if (!order) {
    return null;
  }

  const pendingItems = await OrderItem.count({
    where: {
      orderId,
      status: 'pending'
    }
  });

  if (pendingItems > 0) {
    return order;
  }

  const updates = {};
  if (order.status === 'picking') {
    updates.status = 'picked';
  }
  if (!order.pickingEndTime) {
    updates.pickingEndTime = new Date();
  }

  if (Object.keys(updates).length > 0) {
    await order.update(updates);
  }

  return order;
};

const getPathIndexMap = async (storeId, commodity) => {
  const pickPath = await PickPath.findOne({
    where: {
      storeId,
      commodity,
      isActive: true
    },
    order: [['updatedAt', 'DESC']]
  }) || await PickPath.findOne({
    where: {
      storeId,
      commodity
    },
    order: [['updatedAt', 'DESC']]
  });

  const sequence = Array.isArray(pickPath?.pathSequence) ? pickPath.pathSequence : [];
  const pathIndexMap = new Map();

  sequence.forEach((locationId, index) => {
    if (!pathIndexMap.has(locationId)) {
      pathIndexMap.set(locationId, index);
    }
  });

  return pathIndexMap;
};

const buildPickQueue = (orders, pathIndexMap) => {
  const queue = [];

  orders.forEach((order) => {
    const parsedOrderNotes = parseStructuredOrderNotes(order.notes);
    const itemNotesByOrderItemId = parsedOrderNotes?.itemNotesByOrderItemId || {};
    const orderLevelNotes = typeof parsedOrderNotes?.orderNote === 'string'
      ? parsedOrderNotes.orderNote
      : (order.notes || '');

    order.items.forEach((orderItem) => {
      const orderedQuantity = Number(orderItem.quantity || 0);
      const alreadyPickedQuantity = Number(orderItem.pickedQuantity || 0);
      const remainingQuantity = Math.max(0, orderedQuantity - alreadyPickedQuantity);

      if (remainingQuantity <= 0) {
        return;
      }

      const item = orderItem.item;
      const itemLocations = Array.isArray(item?.locations) ? item.locations : [];

      const locations = itemLocations.map((locationRow) => {
        const locationId = Number(locationRow.locationId);
        const aisleNumber = String(locationRow?.location?.aisle?.aisleNumber || '—');
        const section = locationRow?.location?.section || '';
        const shelf = locationRow?.location?.shelf || '';
        const locationPathIndex = pathIndexMap.has(locationId)
          ? pathIndexMap.get(locationId)
          : Number.MAX_SAFE_INTEGER;

        return {
          locationId,
          aisleNumber,
          section,
          shelf,
          quantityOnHand: Number(locationRow.quantityOnHand || 0),
          pathIndex: locationPathIndex,
          coordinates: locationRow?.location?.coordinates || null
        };
      });

      const sortedLocations = [...locations].sort((left, right) => {
        if (left.pathIndex !== right.pathIndex) {
          return left.pathIndex - right.pathIndex;
        }

        const leftAisle = toAisleNumberValue(left.aisleNumber);
        const rightAisle = toAisleNumberValue(right.aisleNumber);
        if (leftAisle !== rightAisle) {
          return leftAisle - rightAisle;
        }

        return String(left.section).localeCompare(String(right.section));
      });

      const primaryLocation = sortedLocations[0] || null;

      const onHandByAisle = sortedLocations.reduce((accumulator, location) => {
        const aisleKey = `Aisle ${location.aisleNumber}`;
        accumulator[aisleKey] = (accumulator[aisleKey] || 0) + Number(location.quantityOnHand || 0);
        return accumulator;
      }, {});

      queue.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderItemId: orderItem.id,
        scheduledPickupTime: order.scheduledPickupTime,
        quantity: orderedQuantity,
        quantityToPick: remainingQuantity,
        pickedQuantity: alreadyPickedQuantity,
        status: orderItem.status,
        specialInstructions: itemNotesByOrderItemId[String(orderItem.id)] || orderLevelNotes,
        item: {
          id: item?.id,
          name: item?.name || 'Unknown Item',
          upc: item?.upc || '',
          price: Number(item?.price || 0),
          imageUrl: item?.imageUrl || '',
          commodity: item?.commodity || ''
        },
        location: primaryLocation,
        allLocations: sortedLocations,
        otherLocationsCount: Math.max(sortedLocations.length - 1, 0),
        onHandTotal: sortedLocations.reduce((sum, loc) => sum + Number(loc.quantityOnHand || 0), 0),
        substitute: orderItem.substitutedItem ? {
          id: orderItem.substitutedItem.id,
          name: orderItem.substitutedItem.name,
          upc: orderItem.substitutedItem.upc,
          price: Number(orderItem.substitutedItem.price || 0),
          imageUrl: orderItem.substitutedItem.imageUrl || ''
        } : null,
        onHandByAisle
      });
    });
  });

  queue.sort((left, right) => {
    const leftPathIndex = Number(left?.location?.pathIndex ?? Number.MAX_SAFE_INTEGER);
    const rightPathIndex = Number(right?.location?.pathIndex ?? Number.MAX_SAFE_INTEGER);
    if (leftPathIndex !== rightPathIndex) {
      return leftPathIndex - rightPathIndex;
    }

    const leftAisle = toAisleNumberValue(left?.location?.aisleNumber);
    const rightAisle = toAisleNumberValue(right?.location?.aisleNumber);
    if (leftAisle !== rightAisle) {
      return leftAisle - rightAisle;
    }

    return String(left?.item?.name || '').localeCompare(String(right?.item?.name || ''));
  });

  return queue;
};

const walkOrdersInclude = (commodity) => ([
  {
    model: OrderItem,
    as: 'items',
    required: true,
    where: {
      status: 'pending'
    },
    attributes: ['id', 'itemId', 'quantity', 'pickedQuantity', 'status', 'substitutedItemId'],
    include: [
      {
        model: Item,
        as: 'item',
        required: true,
        where: {
          commodity
        },
        attributes: ['id', 'name', 'upc', 'price', 'imageUrl', 'commodity'],
        include: [
          {
            model: ItemLocation,
            as: 'locations',
            required: false,
            attributes: ['id', 'locationId', 'storeId', 'quantityOnHand', 'isPrimaryLocation'],
            include: [
              {
                model: Location,
                as: 'location',
                required: false,
                attributes: ['id', 'aisleId', 'section', 'shelf', 'coordinates'],
                include: [
                  {
                    model: Aisle,
                    as: 'aisle',
                    required: false,
                    attributes: ['id', 'aisleNumber', 'aisleName']
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
]);

const getOrders = async (req, res) => {
  try {
    const { storeId, customerId, status, date } = req.query;

    const where = {};
    if (storeId) where.storeId = storeId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.scheduledPickupTime = {
        [Op.between]: [startOfDay, endOfDay]
      };
    }

    const orders = await Order.findAll({
      where,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'customerId', 'firstName', 'lastName', 'phone', 'isCheckedIn', 'checkInTime', 'parkingSpot', 'vehicleInfo']
        },
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'storeNumber', 'name']
        },
        {
          model: Employee,
          as: 'picker',
          attributes: ['id', 'employeeId', 'firstName', 'lastName'],
          required: false
        },
        {
          model: OrderItem,
          as: 'items',
          include: [
            {
              model: Item,
              as: 'item',
              attributes: ['id', 'upc', 'name', 'price', 'temperature', 'commodity']
            },
            {
              model: Item,
              as: 'substitutedItem',
              attributes: ['id', 'upc', 'name', 'price'],
              required: false
            }
          ]
        }
      ],
      order: [['scheduledPickupTime', 'ASC']]
    });

    const orderIds = orders.map((order) => Number(order.id)).filter((id) => Number.isInteger(id));
    let stagedCountByOrderId = new Map();

    if (orderIds.length > 0) {
      const stagedCounts = await StagingAssignment.findAll({
        attributes: ['orderId', [fn('COUNT', col('id')), 'count']],
        where: {
          orderId: {
            [Op.in]: orderIds
          }
        },
        group: ['orderId'],
        raw: true
      });

      stagedCountByOrderId = stagedCounts.reduce((map, row) => {
        const key = Number(row.orderId);
        if (!Number.isInteger(key)) {
          return map;
        }

        const countValue = Number(row.count || 0);
        map.set(key, Number.isFinite(countValue) ? countValue : 0);
        return map;
      }, new Map());
    }

    const ordersWithStagingCounts = orders.map((order) => {
      const orderJson = order.toJSON();
      const checkIn = extractOrderCheckIn(orderJson.notes);
      return {
        ...orderJson,
        isCheckedIn: checkIn.isCheckedIn,
        checkInTime: checkIn.checkInTime,
        parkingSpot: checkIn.parkingSpot,
        vehicleInfo: checkIn.vehicleInfo,
        stagedToteCount: Number(stagedCountByOrderId.get(Number(order.id)) || 0)
      };
    });

    res.json({
      success: true,
      count: ordersWithStagingCounts.length,
      orders: ordersWithStagingCounts
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error retrieving orders' });
  }
};

const getOrder = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, {
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'customerId', 'firstName', 'lastName', 'phone', 'email', 'vehicleInfo', 'parkingSpot']
        },
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'storeNumber', 'name', 'address', 'city', 'state']
        },
        {
          model: Employee,
          as: 'picker',
          attributes: ['id', 'employeeId', 'firstName', 'lastName'],
          required: false
        },
        {
          model: Employee,
          as: 'dispenser',
          attributes: ['id', 'employeeId', 'firstName', 'lastName'],
          required: false
        },
        {
          model: OrderItem,
          as: 'items',
          include: [
            {
              model: Item,
              as: 'item',
              attributes: ['id', 'upc', 'name', 'description', 'price', 'imageUrl', 'temperature', 'commodity']
            },
            {
              model: Item,
              as: 'substitutedItem',
              attributes: ['id', 'upc', 'name', 'price'],
              required: false
            }
          ]
        }
      ]
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const orderJson = order.toJSON();
    const checkIn = extractOrderCheckIn(orderJson.notes);

    res.json({
      success: true,
      order: {
        ...orderJson,
        isCheckedIn: checkIn.isCheckedIn,
        checkInTime: checkIn.checkInTime,
        parkingSpot: checkIn.parkingSpot,
        vehicleInfo: checkIn.vehicleInfo
      }
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error retrieving order' });
  }
};

const createOrder = async (req, res) => {
  try {
    const {
      customerId,
      storeId,
      scheduledPickupTime,
      items,
      timezoneOffsetMinutes,
      notes: orderNotesInput
    } = req.body;

    if (!scheduledPickupTime) {
      return res.status(400).json({ message: 'scheduledPickupTime is required' });
    }

    // Validate scheduling constraints
    const scheduledTime = new Date(scheduledPickupTime);
    const validation = await validateScheduleTime(scheduledTime, storeId, new Date(), timezoneOffsetMinutes);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid scheduled pickup time',
        errors: validation.errors
      });
    }

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    let totalAmount = 0;
    for (const item of items) {
      const itemData = await Item.findByPk(item.itemId);
      if (itemData) {
        totalAmount += parseFloat(itemData.price) * item.quantity;
      }
    }

    const order = await Order.create({
      orderNumber,
      customerId,
      storeId,
      scheduledPickupTime: scheduledTime,
      totalAmount: totalAmount.toFixed(2)
    });

    const itemNotesByOrderItemId = {};

    const orderItems = await Promise.all(
      items.map(async (item) => {
        const itemData = await Item.findByPk(item.itemId);

        const resolvedSubstitutedItemId = item.substitutedItemId
          || item.substitutionItemId
          || item.substitutionitemid
          || null;

        const resolvedItemNote = item.notes
          || item.specialInstructions
          || item.specialInstruction
          || '';

        const createdOrderItem = await OrderItem.create({
          orderId: order.id,
          itemId: item.itemId,
          quantity: item.quantity,
          unitPrice: itemData.price,
          substitutedItemId: resolvedSubstitutedItemId
        });

        if (resolvedItemNote) {
          itemNotesByOrderItemId[String(createdOrderItem.id)] = String(resolvedItemNote);
        }

        return createdOrderItem;
      })
    );

    const structuredOrderNotes = {
      orderNote: String(orderNotesInput || ''),
      itemNotesByOrderItemId
    };

    if (structuredOrderNotes.orderNote || Object.keys(itemNotesByOrderItemId).length > 0) {
      await order.update({ notes: JSON.stringify(structuredOrderNotes) });
    }


    const completeOrder = await Order.findByPk(order.id, {
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'phone']
        },
        {
          model: OrderItem,
          as: 'items',
          include: [
            {
              model: Item,
              as: 'item'
            }
          ]
        }
      ]
    });

    res.status(201).json({
      success: true,
      order: completeOrder
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Server error creating order' });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const { status, assignedPickerId, assignedDispenserId } = req.body;

    const updateData = { status };
    
    if (status === 'picking' && !order.pickingStartTime) {
      updateData.pickingStartTime = new Date();
    }
    
    if (status === 'picked' && !order.pickingEndTime) {
      updateData.pickingEndTime = new Date();
    }

    if (status === 'completed' && !order.actualPickupTime) {
      updateData.actualPickupTime = new Date();
    }

    if (assignedPickerId) updateData.assignedPickerId = assignedPickerId;
    if (assignedDispenserId) updateData.assignedDispenserId = assignedDispenserId;

    await order.update(updateData);

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error updating order status' });
  }
};

const updateOrderItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { status, substitutedItemId, pickedQuantity, attemptCount } = req.body;

    const orderItem = await OrderItem.findOne({
      where: {
        orderId: id,
        id: itemId
      }
    });

    if (!orderItem) {
      return res.status(404).json({ message: 'Order item not found' });
    }

    const updateData = { status };
    if (substitutedItemId) updateData.substitutedItemId = substitutedItemId;
    if (pickedQuantity !== undefined) updateData.pickedQuantity = pickedQuantity;
    if (attemptCount !== undefined) {
      updateData.attemptCount = attemptCount;
      updateData.foundOnFirstAttempt = attemptCount === 1;
    }
    if (status === 'found' || status === 'substituted') {
      updateData.pickedAt = new Date();
    }

    await orderItem.update(updateData);

    const order = await finalizeOrderIfResolved(id);

    if (order && order.assignedPickerId) {
      await updateEmployeeMetrics(order.assignedPickerId);
    }

    res.json({
      success: true,
      orderItem
    });
  } catch (error) {
    console.error('Update order item error:', error);
    res.status(500).json({ message: 'Server error updating order item' });
  }
};

const getOrdersForPicking = async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const { commodity } = req.query;

    const orders = await Order.findAll({
      where: {
        storeId,
        status: ['pending', 'assigned', 'picking']
      },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: OrderItem,
          as: 'items',
          where: commodity ? {} : undefined,
          include: [
            {
              model: Item,
              as: 'item',
              where: commodity ? { commodity } : undefined
            }
          ]
        }
      ],
      order: [['scheduledPickupTime', 'ASC']]
    });

    const filteredOrders = commodity
      ? orders.filter(order => order.items.length > 0)
      : orders;

    res.json({
      success: true,
      count: filteredOrders.length,
      orders: filteredOrders
    });
  } catch (error) {
    console.error('Get orders for picking error:', error);
    res.status(500).json({ message: 'Server error retrieving orders for picking' });
  }
};

const getCommodityQueueForPicking = async (req, res) => {
  try {
    const employeeId = req.user?.id;
    const storeId = req.params.storeId;
    const now = new Date();
    const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    const orders = await Order.findAll({
      where: {
        storeId,
        [Op.or]: [
          { status: 'pending' },
          {
            status: 'picking',
            assignedPickerId: employeeId
          }
        ],
        scheduledPickupTime: {
          [Op.lte]: threeHoursFromNow
        }
      },
      attributes: ['id', 'orderNumber', 'scheduledPickupTime', 'status'],
      include: [
        {
          model: OrderItem,
          as: 'items',
          required: true,
          where: {
            status: 'pending'
          },
          attributes: ['id', 'quantity', 'pickedQuantity', 'status'],
          include: [
            {
              model: Item,
              as: 'item',
              attributes: ['id', 'name', 'commodity']
            }
          ]
        }
      ],
      order: [['scheduledPickupTime', 'ASC']]
    });

    const activeCommodity = orders
      .filter((order) => order.status === 'picking')
      .flatMap((order) => order.items || [])
      .map((orderItem) => orderItem?.item?.commodity)
      .find(Boolean);

    const commodityMap = new Map();

    orders.forEach((order) => {
      order.items.forEach((orderItem) => {
        const commodityKey = orderItem?.item?.commodity;
        if (!commodityKey) {
          return;
        }

        if (activeCommodity && commodityKey === activeCommodity) {
          return;
        }

        const orderedQuantity = Number(orderItem.quantity || 0);
        const alreadyPickedQuantity = Number(orderItem.pickedQuantity || 0);
        const remainingQuantity = Math.max(0, orderedQuantity - alreadyPickedQuantity);

        if (remainingQuantity <= 0) {
          return;
        }

        const currentEntry = commodityMap.get(commodityKey) || {
          commodity: commodityKey,
          displayName: COMMODITY_DISPLAY_NAMES[commodityKey] || commodityKey,
          itemCount: 0,
          dueTime: order.scheduledPickupTime,
          isOverdue: false,
          orderNumbers: []
        };

        currentEntry.itemCount += remainingQuantity;

        if (new Date(order.scheduledPickupTime) < new Date(currentEntry.dueTime)) {
          currentEntry.dueTime = order.scheduledPickupTime;
        }

        if (!currentEntry.orderNumbers.includes(order.orderNumber)) {
          currentEntry.orderNumbers.push(order.orderNumber);
        }

        commodityMap.set(commodityKey, currentEntry);
      });
    });

    const commodities = Array.from(commodityMap.values())
      .map((commodity) => ({
        ...commodity,
        isOverdue: new Date(commodity.dueTime) < now
      }))
      .sort((left, right) => new Date(left.dueTime) - new Date(right.dueTime));

    res.json({
      success: true,
      count: commodities.length,
      commodities
    });
  } catch (error) {
    console.error('Get commodity queue error:', error);
    res.status(500).json({ message: 'Server error retrieving commodity queue' });
  }
};

const getCurrentPickWalk = async (req, res) => {
  try {
    const employeeId = req.user?.id;
    const storeId = req.params.storeId;

    if (!employeeId) {
      return res.status(401).json({ message: 'Employee authentication is required' });
    }

    if (!storeId) {
      return res.status(400).json({ message: 'storeId is required' });
    }

    const activeOrders = await Order.findAll({
      where: {
        storeId,
        status: 'picking',
        assignedPickerId: employeeId
      },
      attributes: ['id', 'orderNumber'],
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
              model: Item,
              as: 'item',
              required: true,
              attributes: ['id', 'commodity']
            }
          ]
        }
      ]
    });

    if (activeOrders.length === 0) {
      return res.json({
        success: true,
        hasActiveWalk: false
      });
    }

    const firstCommodity = activeOrders
      .flatMap((order) => order.items || [])
      .map((orderItem) => orderItem?.item?.commodity)
      .find(Boolean);

    if (!firstCommodity) {
      return res.json({
        success: true,
        hasActiveWalk: false
      });
    }

    const totalItems = activeOrders.reduce((sum, order) => (
      sum + order.items.reduce((itemSum, orderItem) => {
        const remainingQuantity = Math.max(0, Number(orderItem.quantity || 0) - Number(orderItem.pickedQuantity || 0));
        return itemSum + remainingQuantity;
      }, 0)
    ), 0);

    res.json({
      success: true,
      hasActiveWalk: true,
      commodity: firstCommodity,
      displayName: COMMODITY_DISPLAY_NAMES[firstCommodity] || firstCommodity,
      totalItems,
      orderCount: activeOrders.length
    });
  } catch (error) {
    console.error('Get current pick walk error:', error);
    res.status(500).json({ message: 'Server error retrieving current pick walk' });
  }
};

const startPickWalk = async (req, res) => {
  try {
    const employeeId = req.user?.id;
    const { storeId, commodity } = req.body;

    if (!employeeId) {
      return res.status(401).json({ message: 'Employee authentication is required' });
    }

    if (!storeId || !commodity) {
      return res.status(400).json({ message: 'storeId and commodity are required' });
    }

    const now = new Date();
    const threeHoursFromNow = new Date(now.getTime() + WALK_LOOKAHEAD_HOURS * 60 * 60 * 1000);

    const resumedOrders = await Order.findAll({
      where: {
        storeId,
        status: 'picking',
        assignedPickerId: employeeId,
        scheduledPickupTime: {
          [Op.lte]: threeHoursFromNow
        }
      },
      attributes: ['id', 'orderNumber', 'scheduledPickupTime', 'notes'],
      include: walkOrdersInclude(commodity),
      order: [['scheduledPickupTime', 'ASC']]
    });

    const pathIndexMap = await getPathIndexMap(storeId, commodity);

    if (resumedOrders.length > 0) {
      const resumedQueue = buildPickQueue(resumedOrders, pathIndexMap);

      return res.json({
        success: true,
        resumed: true,
        commodity,
        displayName: COMMODITY_DISPLAY_NAMES[commodity] || commodity,
        totalItems: resumedQueue.reduce((sum, row) => sum + Number(row.quantityToPick || 0), 0),
        queue: resumedQueue
      });
    }

    const pendingOrders = await Order.findAll({
      where: {
        storeId,
        status: 'pending',
        scheduledPickupTime: {
          [Op.lte]: threeHoursFromNow
        }
      },
      attributes: ['id', 'orderNumber', 'scheduledPickupTime', 'notes'],
      include: walkOrdersInclude(commodity),
      order: [['scheduledPickupTime', 'ASC']]
    });

    if (pendingOrders.length === 0) {
      return res.json({
        success: true,
        resumed: false,
        commodity,
        displayName: COMMODITY_DISPLAY_NAMES[commodity] || commodity,
        totalItems: 0,
        queue: []
      });
    }

    const pendingOrderIds = pendingOrders.map((order) => order.id);
    const transaction = await Order.sequelize.transaction();

    let claimedOrderIds = [];

    try {
      const [updatedCount, updatedRows] = await Order.update(
        {
          status: 'picking',
          assignedPickerId: employeeId,
          pickingStartTime: now
        },
        {
          where: {
            id: pendingOrderIds,
            status: 'pending'
          },
          returning: true,
          transaction
        }
      );

      if (updatedCount > 0) {
        claimedOrderIds = (updatedRows || []).map((row) => row.id);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    const claimedOrderIdSet = new Set(claimedOrderIds);
    const claimedOrders = pendingOrders.filter((order) => claimedOrderIdSet.has(order.id));
    const queue = buildPickQueue(claimedOrders, pathIndexMap);

    res.json({
      success: true,
      resumed: false,
      commodity,
      displayName: COMMODITY_DISPLAY_NAMES[commodity] || commodity,
      claimedOrders: claimedOrderIds.length,
      totalItems: queue.reduce((sum, row) => sum + Number(row.quantityToPick || 0), 0),
      queue
    });
  } catch (error) {
    console.error('Start pick walk error:', error);
    res.status(500).json({ message: 'Server error starting pick walk' });
  }
};

const recordPick = async (req, res) => {
  try {
    const { orderId, orderItemId, pickedQuantity, locationId } = req.body;

    if (!orderId || !orderItemId || pickedQuantity === undefined) {
      return res.status(400).json({ message: 'orderId, orderItemId, and pickedQuantity are required' });
    }

    const qtyPicked = Number(pickedQuantity);
    if (!Number.isInteger(qtyPicked) || qtyPicked < 1) {
      return res.status(400).json({ message: 'pickedQuantity must be a positive integer' });
    }

    const orderItem = await OrderItem.findOne({
      where: { id: orderItemId, orderId }
    });

    if (!orderItem) {
      return res.status(404).json({ message: 'Order item not found' });
    }

    const previouslyPicked = Number(orderItem.pickedQuantity || 0);
    const totalPicked = previouslyPicked + qtyPicked;
    const isFullyPicked = totalPicked >= Number(orderItem.quantity);

    const updateData = { pickedQuantity: totalPicked };
    if (isFullyPicked) {
      updateData.status = 'found';
      updateData.pickedAt = new Date();
    }

    await orderItem.update(updateData);

    if (locationId) {
      const itemLocation = await ItemLocation.findOne({
        where: { locationId, itemId: orderItem.itemId }
      });
      if (itemLocation) {
        const newQty = Math.max(0, Number(itemLocation.quantityOnHand) - qtyPicked);
        await itemLocation.update({ quantityOnHand: newQty });
      }
    }

    const order = await finalizeOrderIfResolved(orderId);

    if (order && order.assignedPickerId) {
      await updateEmployeeMetrics(order.assignedPickerId);
    }

    res.json({
      success: true,
      totalPicked,
      isFullyPicked,
      remainingQuantity: Math.max(0, Number(orderItem.quantity) - totalPicked)
    });
  } catch (error) {
    console.error('Record pick error:', error);
    res.status(500).json({ message: 'Server error recording pick' });
  }
};

const endPickWalk = async (req, res) => {
  try {
    const employeeId = req.user?.id;
    const { storeId } = req.body;

    if (!employeeId) {
      return res.status(401).json({ message: 'Employee authentication is required' });
    }

    if (!storeId) {
      return res.status(400).json({ message: 'storeId is required' });
    }

    const claimedOrders = await Order.findAll({
      where: {
        storeId,
        status: 'picking',
        assignedPickerId: employeeId
      },
      attributes: ['id', 'orderNumber'],
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
              model: Item,
              as: 'item',
              required: true,
              attributes: ['id', 'commodity']
            }
          ]
        }
      ]
    });

    const orderIdsToRelease = claimedOrders.map((order) => order.id);

    if (orderIdsToRelease.length === 0) {
      return res.json({
        success: true,
        releasedOrders: 0,
        releasedItems: 0
      });
    }

    await Order.update(
      {
        status: 'pending',
        assignedPickerId: null,
        pickingStartTime: null
      },
      {
        where: {
          id: orderIdsToRelease,
          status: 'picking',
          assignedPickerId: employeeId
        }
      }
    );

    const releasedItems = claimedOrders.reduce((sum, order) => (
      sum + order.items.reduce((itemSum, orderItem) => {
        const remainingQuantity = Math.max(0, Number(orderItem.quantity || 0) - Number(orderItem.pickedQuantity || 0));
        return itemSum + remainingQuantity;
      }, 0)
    ), 0);

    res.json({
      success: true,
      releasedOrders: orderIdsToRelease.length,
      releasedItems
    });
  } catch (error) {
    console.error('End pick walk error:', error);
    res.status(500).json({ message: 'Server error ending pick walk' });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (['dispensing', 'completed'].includes(order.status)) {
      return res.status(400).json({ message: 'Cannot cancel order in current status' });
    }

    await order.update({ status: 'cancelled' });

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error cancelling order' });
  }
};

// Get available time slots for scheduling orders
const getAvailableScheduleSlots = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { startDate, endDate, timezoneOffsetMinutes } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        message: 'startDate and endDate query parameters are required (ISO format)'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        message: 'Invalid date format. Use ISO format (e.g., 2026-03-15)'
      });
    }

    const slots = await getAvailableTimeSlots(storeId, startDate, endDate, new Date(), timezoneOffsetMinutes);

    res.json({
      success: true,
      storeId,
      dateRange: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      },
      slots: slots
    });
  } catch (error) {
    console.error('Get available schedule slots error:', error);
    res.status(500).json({ message: 'Server error retrieving available time slots' });
  }
};

// Get next available slot for a store
const getNextAvailableSlotForStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { timezoneOffsetMinutes } = req.query;

    const nextSlot = await getNextAvailableSlot(storeId, new Date(), timezoneOffsetMinutes);

    if (!nextSlot) {
      return res.status(200).json({
        success: true,
        nextSlot: null,
        message: 'No available slots within the next 7 days'
      });
    }

    res.json({
      success: true,
      nextSlot
    });
  } catch (error) {
    console.error('Get next available slot error:', error);
    res.status(500).json({ message: 'Server error retrieving next available slot' });
  }
};

// Validate if a specific time is available for scheduling
const validateOrderScheduleTime = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { scheduledPickupTime, timezoneOffsetMinutes } = req.body;

    if (!scheduledPickupTime) {
      return res.status(400).json({
        message: 'scheduledPickupTime is required in request body'
      });
    }

    const scheduledTime = new Date(scheduledPickupTime);
    if (isNaN(scheduledTime.getTime())) {
      return res.status(400).json({
        message: 'Invalid date format for scheduledPickupTime'
      });
    }

    const validation = await validateScheduleTime(scheduledTime, storeId, new Date(), timezoneOffsetMinutes);

    res.json({
      success: validation.isValid,
      isValid: validation.isValid,
      errors: validation.errors,
      proposedTime: scheduledTime.toISOString()
    });
  } catch (error) {
    console.error('Validate order schedule time error:', error);
    res.status(500).json({ message: 'Server error validating schedule time' });
  }
};

// Trigger manual schedule purge (for admin/maintenance)
const triggerSchedulePurge = async (req, res) => {
  try {
    const purgedCount = await purgeOldSchedules();

    res.json({
      success: true,
      message: `Schedule purge completed. Removed ${purgedCount} completed/cancelled orders older than 48 hours from their scheduled date`,
      purgedCount
    });
  } catch (error) {
    console.error('Schedule purge error:', error);
    res.status(500).json({ message: 'Server error during schedule purge' });
  }
};

module.exports = {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  updateOrderItem,
  getOrdersForPicking,
  getCommodityQueueForPicking,
  getCurrentPickWalk,
  startPickWalk,
  recordPick,
  endPickWalk,
  cancelOrder,
  getAvailableScheduleSlots,
  getNextAvailableSlotForStore,
  validateOrderScheduleTime,
  triggerSchedulePurge
};
