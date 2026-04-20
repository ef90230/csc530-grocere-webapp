const { Employee, Customer, Store } = require('../models');
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

    const isAssignedStoreAdmin = isStoreAdminEmployee(user?.storeId, user?.id);

    if (userType === 'admin' && !isAssignedStoreAdmin) {
      return res.status(401).json({ message: 'Invalid credentials' });
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

module.exports = {
  login,
  registerEmployee,
  registerCustomer,
  registerAdmin,
  getMe
};
