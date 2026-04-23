const { Op } = require('sequelize');
const { Employee, Customer, Store, Order, OrderItem, StagingAssignment } = require('../models');
const { generateToken } = require('../middleware/auth');
const {
  getEmployeeTimeframeStats
} = require('../utils/employeeTimeframeStatsService');
const { getStoreSettingsFromStore, normalizeStoreSettings } = require('../utils/storeSettings');
const {
  getStoreAdminEmployeeId,
  assignStoreAdmin,
  clearStoreAdmin,
  isStoreAdminEmployee
} = require('../utils/storeAdminAssignmentStore');

const INVALID_PREFERRED_STORE_MESSAGE = 'Preferred store number not assigned';
const TERMINAL_ORDER_STATUSES = ['completed', 'cancelled'];

const sanitizeName = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, 60);
};

const sanitizePhone = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, 32);
};

const cancelOpenCustomerOrders = async (customerId, transaction) => {
  const openOrders = await Order.findAll({
    where: {
      customerId,
      status: {
        [Op.notIn]: TERMINAL_ORDER_STATUSES
      }
    },
    attributes: ['id', 'storeId', 'orderNumber'],
    transaction
  });

  if (openOrders.length === 0) {
    return 0;
  }

  const openOrderIds = openOrders.map((order) => Number(order.id)).filter(Number.isInteger);
  const openOrderNumbers = [...new Set(
    openOrders
      .map((order) => String(order.orderNumber || '').trim())
      .filter(Boolean)
  )];

  const relatedOrders = openOrderNumbers.length > 0
    ? await Order.findAll({
      where: {
        orderNumber: openOrderNumbers,
        status: {
          [Op.notIn]: TERMINAL_ORDER_STATUSES
        }
      },
      attributes: ['id', 'storeId'],
      transaction
    })
    : [];

  const orderIds = [...new Set([
    ...openOrderIds,
    ...relatedOrders.map((order) => Number(order.id)).filter(Number.isInteger)
  ])];
  const storeIds = [...new Set([
    ...openOrders.map((order) => Number(order.storeId)).filter(Number.isInteger),
    ...relatedOrders.map((order) => Number(order.storeId)).filter(Number.isInteger)
  ])];

  await Order.update(
    { status: 'cancelled' },
    {
      where: {
        id: orderIds,
        status: {
          [Op.notIn]: TERMINAL_ORDER_STATUSES
        }
      },
      transaction
    }
  );

  await OrderItem.update(
    { status: 'canceled' },
    {
      where: {
        orderId: orderIds,
        status: 'pending'
      },
      transaction
    }
  );

  for (const storeId of storeIds) {
    await StagingAssignment.destroy({
      where: {
        storeId,
        orderId: orderIds
      },
      transaction
    });
  }

  return orderIds.length;
};

const resolveStoreFromNumber = async (storeNumberInput) => {
  if (storeNumberInput === undefined || storeNumberInput === null || String(storeNumberInput).trim() === '') {
    return null;
  }

  const normalizedStoreNumber = String(storeNumberInput).trim();
  const storeByNumber = await Store.findOne({ where: { storeNumber: normalizedStoreNumber } });
  if (storeByNumber) {
    return storeByNumber;
  }

  const numericStoreId = Number(normalizedStoreNumber);
  if (Number.isInteger(numericStoreId) && numericStoreId > 0) {
    return Store.findByPk(numericStoreId);
  }

  return null;
};

const login = async (req, res) => {
  try {
    const { email, password, userType } = req.body;

    const Model = userType === 'customer' ? Customer : Employee;

    const user = await Model.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if ((userType === 'employee' || userType === 'admin') && !user.isActive) {
      return res.status(401).json({ message: 'Account is not active' });
    }

    let isAssignedStoreAdmin = isStoreAdminEmployee(user?.storeId, user?.id);

    // Recover gracefully when file-based admin assignment metadata is missing/stale.
    if (userType === 'admin' && !isAssignedStoreAdmin) {
      const normalizedRole = String(user?.role || '').toLowerCase();

      if (normalizedRole === 'manager' && user?.storeId) {
        const existingAdminEmployeeId = getStoreAdminEmployeeId(user.storeId);

        if (!existingAdminEmployeeId) {
          assignStoreAdmin(user.storeId, user.id);
          isAssignedStoreAdmin = true;
        } else {
          const existingAdmin = await Employee.findOne({
            where: {
              id: existingAdminEmployeeId,
              isActive: true
            },
            attributes: ['id']
          });

          if (!existingAdmin) {
            clearStoreAdmin(user.storeId);
            assignStoreAdmin(user.storeId, user.id);
            isAssignedStoreAdmin = true;
          }
        }
      }

      if (!isAssignedStoreAdmin) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    }

    if (userType === 'employee' && isAssignedStoreAdmin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user.id, userType || 'employee');

    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json({
      success: true,
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

const registerEmployee = async (req, res) => {
  try {
    const { employeeId, firstName, lastName, email, password, role, storeId } = req.body;

    if (role === 'admin') {
      return res.status(400).json({ message: 'Use admin signup for admin accounts' });
    }

    const existingEmployee = await Employee.findOne({
      where: { email }
    });

    if (existingEmployee) {
      return res.status(400).json({ message: 'Employee with this email already exists' });
    }

    const existingEmployeeId = await Employee.findOne({
      where: { employeeId }
    });

    if (existingEmployeeId) {
      return res.status(400).json({ message: 'Employee ID already exists' });
    }

    const assignedStore = await resolveStoreFromNumber(storeId);
    if (!assignedStore) {
      return res.status(400).json({ message: INVALID_PREFERRED_STORE_MESSAGE });
    }

    const employee = await Employee.create({
      employeeId,
      firstName,
      lastName,
      email,
      password,
      role: role || 'picker',
      storeId: assignedStore.id
    });

    const token = generateToken(employee.id, 'employee');

    const employeeResponse = employee.toJSON();
    delete employeeResponse.password;

    res.status(201).json({
      success: true,
      token,
      employee: employeeResponse
    });
  } catch (error) {
    console.error('Employee registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

const registerCustomer = async (req, res) => {
  try {
    const { customerId, firstName, lastName, email, password, phone, preferredStoreId } = req.body;

    const existingCustomer = await Customer.findOne({
      where: { email }
    });

    if (existingCustomer) {
      return res.status(400).json({ message: 'Customer with this email already exists' });
    }

    const existingCustomerId = await Customer.findOne({
      where: { customerId }
    });

    if (existingCustomerId) {
      return res.status(400).json({ message: 'Customer ID already exists' });
    }

    let resolvedPreferredStoreId = null;
    if (preferredStoreId !== undefined && preferredStoreId !== null && String(preferredStoreId).trim() !== '') {
      const assignedStore = await resolveStoreFromNumber(preferredStoreId);
      if (!assignedStore) {
        return res.status(400).json({ message: INVALID_PREFERRED_STORE_MESSAGE });
      }
      resolvedPreferredStoreId = assignedStore.id;
    }

    const customer = await Customer.create({
      customerId,
      firstName,
      lastName,
      email,
      password,
      phone,
      preferredStoreId: resolvedPreferredStoreId
    });

    const token = generateToken(customer.id, 'customer');

    const customerResponse = customer.toJSON();
    delete customerResponse.password;

    res.status(201).json({
      success: true,
      token,
      customer: customerResponse
    });
  } catch (error) {
    console.error('Customer registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

const registerAdmin = async (req, res) => {
  try {
    const { employeeId, firstName, lastName, email, password, storeId } = req.body;

    const existingEmployee = await Employee.findOne({
      where: { email }
    });

    if (existingEmployee) {
      return res.status(400).json({ message: 'Employee with this email already exists' });
    }

    const existingEmployeeId = await Employee.findOne({
      where: { employeeId }
    });

    if (existingEmployeeId) {
      return res.status(400).json({ message: 'Employee ID already exists' });
    }

    const normalizedStoreNumber = String(storeId || '').trim();
    if (!normalizedStoreNumber) {
      return res.status(400).json({ message: INVALID_PREFERRED_STORE_MESSAGE });
    }

    let assignedStore = await resolveStoreFromNumber(normalizedStoreNumber);

    if (!assignedStore) {
      assignedStore = await Store.create({
        storeNumber: normalizedStoreNumber,
        name: `Store ${normalizedStoreNumber}`,
        address: 'Not set',
        city: 'Not set',
        state: 'NA',
        zipCode: '00000',
        phone: '0000000000'
      });
    }

    const existingAdminEmployeeId = getStoreAdminEmployeeId(assignedStore.id);
    if (existingAdminEmployeeId) {
      const existingAdmin = await Employee.findOne({
        where: {
          id: existingAdminEmployeeId,
          isActive: true
        }
      });

      if (existingAdmin) {
        return res.status(400).json({ message: 'Admin already assigned for that store' });
      }

      clearStoreAdmin(assignedStore.id);
    }

    const employee = await Employee.create({
      employeeId,
      firstName,
      lastName,
      email,
      password,
      role: 'manager',
      storeId: assignedStore.id
    });

    assignStoreAdmin(assignedStore.id, employee.id);

    const token = generateToken(employee.id, 'admin');

    const employeeResponse = employee.toJSON();
    delete employeeResponse.password;

    return res.status(201).json({
      success: true,
      token,
      employee: employeeResponse
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    return res.status(500).json({ message: 'Server error during registration' });
  }
};

const getMe = async (req, res) => {
  try {
    const userResponse = req.user.toJSON();

    if (req.userType === 'employee' && req.user?.id) {
      const storeSettings = req.user?.store ? getStoreSettingsFromStore(req.user.store) : normalizeStoreSettings(null);
      const timeframeStats = await getEmployeeTimeframeStats(req.user.id, {
        timeZone: storeSettings?.scheduling?.timeZone
      });
      userResponse.pickRate = Number(timeframeStats?.today?.pickRate || 0);
    }

    res.json({
      success: true,
      userType: req.userType,
      user: userResponse
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateMe = async (req, res) => {
  try {
    const firstName = sanitizeName(req.body?.firstName);
    const lastName = sanitizeName(req.body?.lastName);

    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First and last name are required.' });
    }

    const Model = req.userType === 'customer' ? Customer : Employee;
    const user = await Model.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (req.userType === 'customer') {
      const phone = sanitizePhone(req.body?.phone);
      if (!phone) {
        return res.status(400).json({ message: 'Phone number is required.' });
      }

      let resolvedPreferredStoreId = null;
      const rawPreferredStoreId = req.body?.preferredStoreId;
      if (rawPreferredStoreId !== undefined && rawPreferredStoreId !== null && String(rawPreferredStoreId).trim() !== '') {
        const assignedStore = await resolveStoreFromNumber(rawPreferredStoreId);
        if (!assignedStore) {
          return res.status(400).json({ message: INVALID_PREFERRED_STORE_MESSAGE });
        }
        resolvedPreferredStoreId = assignedStore.id;
      }

      await user.update({
        firstName,
        lastName,
        phone,
        preferredStoreId: resolvedPreferredStoreId
      });
    } else {
      await user.update({ firstName, lastName });
    }

    const userResponse = user.toJSON();
    delete userResponse.password;

    return res.json({
      success: true,
      user: userResponse
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ message: 'Server error updating profile' });
  }
};

const deleteMe = async (req, res) => {
  let transaction;
  try {
    transaction = await Employee.sequelize.transaction();

    if (req.userType === 'customer') {
      const customer = await Customer.findByPk(req.user.id, { transaction });

      if (!customer) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Customer not found.' });
      }

      const canceledOrderCount = await cancelOpenCustomerOrders(customer.id, transaction);
      const deletedSuffix = `${customer.id}-${Date.now()}`;

      await customer.update({
        firstName: 'Deleted',
        lastName: 'Account',
        email: `deleted-customer-${deletedSuffix}@deleted.local`,
        password: `Deleted-${deletedSuffix}-Aa1!`,
        phone: '0000000000'
      }, { transaction });

      await transaction.commit();

      return res.json({
        success: true,
        canceledOrderCount,
        message: 'Account deleted successfully.'
      });
    }

    const employee = await Employee.findByPk(req.user.id, { transaction });

    if (!employee) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Employee not found.' });
    }

    if (req.authType === 'admin' || isStoreAdminEmployee(employee.storeId, employee.id)) {
      clearStoreAdmin(employee.storeId);
    }

    await employee.update({ isActive: false }, { transaction });
    await transaction.commit();

    return res.json({
      success: true,
      message: 'Account deleted successfully.'
    });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    console.error('Delete profile error:', error);
    return res.status(500).json({ message: 'Server error deleting account' });
  }
};

const getAdminSlotStatus = async (req, res) => {
  try {
    if (req.userType !== 'employee' || req.authType === 'admin') {
      return res.json({ success: true, available: false });
    }

    const employee = await Employee.findByPk(req.user.id, {
      attributes: ['id', 'storeId', 'isActive']
    });

    if (!employee || !employee.isActive || !employee.storeId) {
      return res.json({ success: true, available: false });
    }

    const assignedEmployeeId = getStoreAdminEmployeeId(employee.storeId);
    if (assignedEmployeeId) {
      const assignedAdmin = await Employee.findOne({
        where: {
          id: assignedEmployeeId,
          isActive: true
        },
        attributes: ['id']
      });

      if (assignedAdmin) {
        return res.json({ success: true, available: false, storeId: employee.storeId });
      }

      clearStoreAdmin(employee.storeId);
    }

    return res.json({
      success: true,
      available: true,
      storeId: employee.storeId
    });
  } catch (error) {
    console.error('Get admin slot status error:', error);
    return res.status(500).json({ message: 'Server error retrieving admin slot status' });
  }
};

const becomeAdmin = async (req, res) => {
  try {
    if (req.userType !== 'employee' || req.authType === 'admin') {
      return res.status(403).json({ message: 'Only employees can claim an admin role.' });
    }

    const employee = await Employee.findByPk(req.user.id);

    if (!employee || !employee.isActive || !employee.storeId) {
      return res.status(403).json({ message: 'Employee account is not eligible for admin claim.' });
    }

    const assignedEmployeeId = getStoreAdminEmployeeId(employee.storeId);
    if (assignedEmployeeId) {
      const assignedAdmin = await Employee.findOne({
        where: {
          id: assignedEmployeeId,
          isActive: true
        },
        attributes: ['id']
      });

      if (assignedAdmin) {
        return res.status(409).json({ message: 'Admin role is already filled for this store.' });
      }

      clearStoreAdmin(employee.storeId);
    }

    assignStoreAdmin(employee.storeId, employee.id);

    const token = generateToken(employee.id, 'admin');
    const employeeResponse = employee.toJSON();
    delete employeeResponse.password;

    return res.json({
      success: true,
      token,
      userType: 'admin',
      user: employeeResponse
    });
  } catch (error) {
    console.error('Become admin error:', error);
    return res.status(500).json({ message: 'Server error claiming admin role' });
  }
};

module.exports = {
  login,
  registerEmployee,
  registerCustomer,
  registerAdmin,
  getMe,
  updateMe,
  deleteMe,
  getAdminSlotStatus,
  becomeAdmin
};
