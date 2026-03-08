const { Customer, Order, Store } = require('../models');

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

    const { vehicleInfo, parkingSpot } = req.body;

    await customer.update({
      isCheckedIn: true,
      checkInTime: new Date(),
      vehicleInfo: vehicleInfo || customer.vehicleInfo,
      parkingSpot: parkingSpot || customer.parkingSpot
    });

    res.json({
      success: true,
      message: 'Checked in successfully',
      customer: {
        id: customer.id,
        isCheckedIn: customer.isCheckedIn,
        checkInTime: customer.checkInTime,
        parkingSpot: customer.parkingSpot
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

    await customer.update({
      isCheckedIn: false,
      checkInTime: null,
      parkingSpot: null
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
      where: { isCheckedIn: true },
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
          attributes: ['id', 'orderNumber', 'status', 'scheduledPickupTime']
        }
      ],
      order: [['checkInTime', 'ASC']]
    });

    res.json({
      success: true,
      count: customers.length,
      customers
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
