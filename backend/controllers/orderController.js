const { Order, OrderItem, Customer, Store, Employee, Item, ItemLocation } = require('../models');
const { Op } = require('sequelize');

/**
 * @desc    Get all orders with filters
 * @route   GET /api/orders
 * @access  Private
 */
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

/**
 * @desc    Get single order
 * @route   GET /api/orders/:id
 * @access  Private
 */
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

/**
 * @desc    Create new order
 * @route   POST /api/orders
 * @access  Private (Customer)
 */
const createOrder = async (req, res) => {
  try {
    const { customerId, storeId, scheduledPickupTime, items } = req.body;

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Calculate total amount
    let totalAmount = 0;
    for (const item of items) {
      const itemData = await Item.findByPk(item.itemId);
      if (itemData) {
        totalAmount += parseFloat(itemData.price) * item.quantity;
      }
    }

    // Create order
    const order = await Order.create({
      orderNumber,
      customerId,
      storeId,
      scheduledPickupTime,
      totalAmount: totalAmount.toFixed(2)
    });

    // Create order items
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

    // Fetch complete order with relations
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

/**
 * @desc    Update order status
 * @route   PUT /api/orders/:id/status
 * @access  Private (Employee)
 */
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

/**
 * @desc    Update order item status
 * @route   PUT /api/orders/:id/items/:itemId
 * @access  Private (Picker)
 */
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

    res.json({
      success: true,
      orderItem
    });
  } catch (error) {
    console.error('Update order item error:', error);
    res.status(500).json({ message: 'Server error updating order item' });
  }
};

/**
 * @desc    Get orders grouped by commodity for picking
 * @route   GET /api/orders/picking/:storeId
 * @access  Private (Picker)
 */
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

    // Filter orders that have items matching the commodity
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

/**
 * @desc    Cancel order
 * @route   DELETE /api/orders/:id
 * @access  Private (Customer or Manager)
 */
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

module.exports = {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  updateOrderItem,
  getOrdersForPicking,
  cancelOrder
};
