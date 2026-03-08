const { Customer, Order, Store } = require('../models');

/**
 * @desc    Get all customers
 * @route   GET /api/customers
 * @access  Private (Manager)
 */
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

/**
 * @desc    Get single customer
 * @route   GET /api/customers/:id
 * @access  Private
 */
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

/**
 * @desc    Update customer
 * @route   PUT /api/customers/:id
 * @access  Private (Self or Manager)
 */
const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Don't allow updating password through this endpoint
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

/**
 * @desc    Check in customer (for pickup)
 * @route   POST /api/customers/:id/checkin
 * @access  Private (Customer)
 */
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

/**
 * @desc    Check out customer (after pickup)
 * @route   POST /api/customers/:id/checkout
 * @access  Private (Employee or Customer)
 */
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

/**
 * @desc    Get checked-in customers at a store
 * @route   GET /api/customers/checkedin/:storeId
 * @access  Private (Employee)
 */
const getCheckedInCustomers = async (req, res) => {
  try {
    const storeId = req.params.storeId;

    // Get customers with active orders at this store who are checked in
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
