const { Order, OrderItem, Customer, Store, Employee, Item, ItemLocation } = require('../models');
const { Op } = require('sequelize');
const {
  validateScheduleTime,
  getAvailableTimeSlots,
  getNextAvailableSlot,
  purgeOldSchedules
} = require('../utils/schedulingService');
const { updateEmployeeMetrics } = require('../utils/employeeMetricsService');

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
          attributes: ['id', 'customerId', 'firstName', 'lastName', 'phone', 'isCheckedIn']
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
            }
          ]
        }
      ],
      order: [['scheduledPickupTime', 'ASC']]
    });

    res.json({
      success: true,
      count: orders.length,
      orders
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

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error retrieving order' });
  }
};

const createOrder = async (req, res) => {
  try {
    const { customerId, storeId, scheduledPickupTime, items } = req.body;

    if (!scheduledPickupTime) {
      return res.status(400).json({ message: 'scheduledPickupTime is required' });
    }

    // Validate scheduling constraints
    const scheduledTime = new Date(scheduledPickupTime);
    const validation = await validateScheduleTime(scheduledTime, storeId);

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

    const orderItems = await Promise.all(
      items.map(async (item) => {
        const itemData = await Item.findByPk(item.itemId);
        return OrderItem.create({
          orderId: order.id,
          itemId: item.itemId,
          quantity: item.quantity,
          unitPrice: itemData.price
        });
      })
    );


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

    // If picker is assigned and an item was successfully picked, update their metrics.
    if (['found', 'substituted'].includes(status)) {
      const order = await Order.findByPk(id);
      if (order && order.assignedPickerId) {
        await updateEmployeeMetrics(order.assignedPickerId);
      }
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
    const { startDate, endDate } = req.query;

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

    const slots = await getAvailableTimeSlots(storeId, start, end);

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

    const nextSlot = await getNextAvailableSlot(storeId);

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
    const { scheduledPickupTime } = req.body;

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

    const validation = await validateScheduleTime(scheduledTime, storeId);

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
  cancelOrder,
  getAvailableScheduleSlots,
  getNextAvailableSlotForStore,
  validateOrderScheduleTime,
  triggerSchedulePurge
};
