const { Employee, Customer } = require('../models');
const { generateToken } = require('../middleware/auth');
const {
  calculateAverageWalkPickRate,
  getCompletedPickWalkHistory
} = require('../utils/employeeMetricsService');

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

    if (userType === 'employee' && !user.isActive) {
      return res.status(401).json({ message: 'Account is not active' });
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

    const employee = await Employee.create({
      employeeId,
      firstName,
      lastName,
      email,
      password,
      role: role || 'picker',
      storeId
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

    const customer = await Customer.create({
      customerId,
      firstName,
      lastName,
      email,
      password,
      phone,
      preferredStoreId
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

const getMe = async (req, res) => {
  try {
    const userResponse = req.user.toJSON();

    if (req.userType === 'employee' && req.user?.id) {
      const walkHistory = await getCompletedPickWalkHistory(req.user.id);
      userResponse.pickRate = calculateAverageWalkPickRate(walkHistory);
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
  getMe
};

module.exports = {
  login,
  registerEmployee,
  registerCustomer,
  getMe
};
