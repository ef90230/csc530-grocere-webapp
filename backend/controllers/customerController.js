const { Customer, Order, Store } = require('../models');

const parseOrderNotesObject = (notesValue) => {
  if (!notesValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(notesValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const extractOrderCheckIn = (order) => {
  const parsedNotes = parseOrderNotesObject(order?.notes);
  const checkIn = parsedNotes?.checkIn;

  return {
    isCheckedIn: Boolean(checkIn?.isCheckedIn),
    checkInTime: checkIn?.checkInTime || null,
    parkingSpot: checkIn?.parkingSpot || null,
    vehicleInfo: checkIn?.vehicleInfo || null
  };
};

const buildOrderNotesWithCheckIn = (order, checkInPatch) => {
  const parsedNotes = parseOrderNotesObject(order?.notes);
  const orderNote = typeof parsedNotes?.orderNote === 'string'
    ? parsedNotes.orderNote
    : (typeof order?.notes === 'string' && !parsedNotes ? order.notes : '');
  const itemNotesByOrderItemId = parsedNotes?.itemNotesByOrderItemId && typeof parsedNotes.itemNotesByOrderItemId === 'object'
    ? parsedNotes.itemNotesByOrderItemId
    : {};

  return JSON.stringify({
    ...(parsedNotes || {}),
    orderNote,
    itemNotesByOrderItemId,
    checkIn: {
      ...(parsedNotes?.checkIn || {}),
      ...checkInPatch
    }
  });
};

const getCustomers = async (req, res) => {
  try {
    const { search, isCheckedIn } = req.query;
    
    const where = {};
    if (isCheckedIn !== undefined) where.isCheckedIn = isCheckedIn === 'true';

    const customers = await Customer.findAll({
      where,
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Store,
          as: 'preferredStore',
          attributes: ['id', 'storeNumber', 'name']
        }
      ],
      order: [['lastName', 'ASC'], ['firstName', 'ASC']]
    });

    res.json({
      success: true,
      count: customers.length,
      customers
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ message: 'Server error retrieving customers' });
  }
};

const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Store,
          as: 'preferredStore',
          attributes: ['id', 'storeNumber', 'name', 'address', 'city', 'state']
        }
      ]
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({
      success: true,
      customer
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ message: 'Server error retrieving customer' });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    delete req.body.password;

    await customer.update(req.body);

    const customerResponse = customer.toJSON();
    delete customerResponse.password;

    res.json({
      success: true,
      customer: customerResponse
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ message: 'Server error updating customer' });
  }
};

const checkIn = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const { orderId, vehicleInfo, parkingSpot } = req.body;
    const resolvedOrderId = Number(orderId);

    if (!Number.isInteger(resolvedOrderId)) {
      return res.status(400).json({ message: 'orderId is required for check in.' });
    }

    const order = await Order.findOne({
      where: {
        id: resolvedOrderId,
        customerId: customer.id
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found for customer.' });
    }

    const currentCheckIn = extractOrderCheckIn(order);
    const nextCheckInTime = new Date().toISOString();

    await order.update({
      notes: buildOrderNotesWithCheckIn(order, {
        isCheckedIn: true,
        checkInTime: nextCheckInTime,
        vehicleInfo: vehicleInfo || currentCheckIn.vehicleInfo,
        parkingSpot: parkingSpot || currentCheckIn.parkingSpot
      })
    });

    const updatedCheckIn = extractOrderCheckIn(order);

    res.json({
      success: true,
      message: 'Checked in successfully',
      order: {
        id: order.id,
        isCheckedIn: updatedCheckIn.isCheckedIn,
        checkInTime: updatedCheckIn.checkInTime,
        parkingSpot: updatedCheckIn.parkingSpot,
        vehicleInfo: updatedCheckIn.vehicleInfo
      }
    });
  } catch (error) {
    console.error('Check in error:', error);
    res.status(500).json({ message: 'Server error during check in' });
  }
};

const checkOut = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const resolvedOrderId = Number(req.body?.orderId);
    if (!Number.isInteger(resolvedOrderId)) {
      return res.status(400).json({ message: 'orderId is required for check out.' });
    }

    const order = await Order.findOne({
      where: {
        id: resolvedOrderId,
        customerId: customer.id
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found for customer.' });
    }

    await order.update({
      notes: buildOrderNotesWithCheckIn(order, {
        isCheckedIn: false,
        checkInTime: null,
        parkingSpot: null
      })
    });

    res.json({
      success: true,
      message: 'Checked out successfully'
    });
  } catch (error) {
    console.error('Check out error:', error);
    res.status(500).json({ message: 'Server error during check out' });
  }
};

const getCheckedInCustomers = async (req, res) => {
  try {
    const storeId = req.params.storeId;

    const customers = await Customer.findAll({
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Order,
          as: 'orders',
          where: {
            storeId: storeId,
            status: ['ready', 'staged']
          },
          required: true,
          attributes: ['id', 'orderNumber', 'status', 'scheduledPickupTime', 'notes']
        }
      ],
      order: [['lastName', 'ASC'], ['firstName', 'ASC']]
    });

    const customersWithCheckedInOrders = customers
      .map((customer) => {
        const customerJson = customer.toJSON();
        const checkedInOrders = (customerJson.orders || [])
          .map((order) => {
            const checkIn = extractOrderCheckIn(order);
            return {
              ...order,
              isCheckedIn: checkIn.isCheckedIn,
              checkInTime: checkIn.checkInTime,
              parkingSpot: checkIn.parkingSpot,
              vehicleInfo: checkIn.vehicleInfo
            };
          })
          .filter((order) => order.isCheckedIn);

        return {
          ...customerJson,
          orders: checkedInOrders
        };
      })
      .filter((customer) => customer.orders.length > 0)
      .sort((left, right) => {
        const leftEarliest = new Date(left.orders[0]?.checkInTime || 0).getTime();
        const rightEarliest = new Date(right.orders[0]?.checkInTime || 0).getTime();
        return leftEarliest - rightEarliest;
      });

    res.json({
      success: true,
      count: customersWithCheckedInOrders.length,
      customers: customersWithCheckedInOrders
    });
  } catch (error) {
    console.error('Get checked-in customers error:', error);
    res.status(500).json({ message: 'Server error retrieving checked-in customers' });
  }
};

module.exports = {
  getCustomers,
  getCustomer,
  updateCustomer,
  checkIn,
  checkOut,
  getCheckedInCustomers
};
