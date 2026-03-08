const { Employee, Store, Order } = require('../models');

/**
 * @desc    Get all employees
 * @route   GET /api/employees
 * @access  Private (Manager)
 */
const getEmployees = async (req, res) => {
  try {
    const { storeId, role, isActive } = req.query;
    
    const where = {};
    if (storeId) where.storeId = storeId;
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const employees = await Employee.findAll({
      where,
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'storeNumber', 'name']
        }
      ],
      order: [['lastName', 'ASC'], ['firstName', 'ASC']]
    });

    res.json({
      success: true,
      count: employees.length,
      employees
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ message: 'Server error retrieving employees' });
  }
};

/**
 * @desc    Get single employee
 * @route   GET /api/employees/:id
 * @access  Private
 */
const getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'storeNumber', 'name', 'address', 'city', 'state']
        }
      ]
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({
      success: true,
      employee
    });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ message: 'Server error retrieving employee' });
  }
};

/**
 * @desc    Create new employee
 * @route   POST /api/employees
 * @access  Private (Manager)
 */
const createEmployee = async (req, res) => {
  try {
    const employee = await Employee.create(req.body);

    const employeeResponse = employee.toJSON();
    delete employeeResponse.password;

    res.status(201).json({
      success: true,
      employee: employeeResponse
    });
  } catch (error) {
    console.error('Create employee error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Employee ID or email already exists' });
    }
    res.status(500).json({ message: 'Server error creating employee' });
  }
};

/**
 * @desc    Update employee
 * @route   PUT /api/employees/:id
 * @access  Private (Manager or self)
 */
const updateEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Don't allow updating password through this endpoint
    delete req.body.password;

    await employee.update(req.body);

    const employeeResponse = employee.toJSON();
    delete employeeResponse.password;

    res.json({
      success: true,
      employee: employeeResponse
    });
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ message: 'Server error updating employee' });
  }
};

/**
 * @desc    Delete employee (soft delete by setting isActive to false)
 * @route   DELETE /api/employees/:id
 * @access  Private (Manager)
 */
const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    await employee.update({ isActive: false });

    res.json({
      success: true,
      message: 'Employee deactivated successfully'
    });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ message: 'Server error deleting employee' });
  }
};

/**
 * @desc    Get employee performance metrics
 * @route   GET /api/employees/:id/metrics
 * @access  Private
 */
const getEmployeeMetrics = async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id, {
      attributes: [
        'id',
        'employeeId',
        'firstName',
        'lastName',
        'pickRate',
        'firstTimePickPercent',
        'preSubstitutionPercent',
        'postSubstitutionPercent',
        'onTimePercent',
        'weightedEfficiency'
      ]
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Get recent orders
    const recentOrders = await Order.findAll({
      where: { assignedPickerId: employee.id },
      limit: 20,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'orderNumber', 'status', 'pickingStartTime', 'pickingEndTime']
    });

    res.json({
      success: true,
      employee: {
        ...employee.toJSON(),
        recentOrders
      }
    });
  } catch (error) {
    console.error('Get employee metrics error:', error);
    res.status(500).json({ message: 'Server error retrieving metrics' });
  }
};

module.exports = {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeMetrics
};
