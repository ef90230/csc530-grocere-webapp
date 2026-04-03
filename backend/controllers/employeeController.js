const { Employee, Store, Order } = require('../models');
const {
  calculateAverageWalkPickRate,
  getCompletedPickWalkHistory
} = require('../utils/employeeMetricsService');

const METRIC_FIELDS = [
  'pickRate',
  'itemsPicked',
  'firstTimePickPercent',
  'preSubstitutionPercent',
  'postSubstitutionPercent',
  'percentNotFound',
  'onTimePercent',
  'weightedEfficiency'
];

const toNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const mapEmployeeStats = (employee) => {
  if (!employee) {
    return METRIC_FIELDS.reduce((accumulator, field) => {
      accumulator[field] = 0;
      return accumulator;
    }, {});
  }

  return METRIC_FIELDS.reduce((accumulator, field) => {
    accumulator[field] = toNumber(employee[field]);
    return accumulator;
  }, {});
};

const getStoreAggregatedStats = (employees) => {
  if (!employees.length) {
    return mapEmployeeStats(null);
  }

  return METRIC_FIELDS.reduce((accumulator, field) => {
    const total = employees.reduce((sum, employee) => {
      return sum + toNumber(employee[field]);
    }, 0);

    if (field === 'itemsPicked') {
      accumulator[field] = total;
      return accumulator;
    }

    accumulator[field] = total / employees.length;
    return accumulator;
  }, {});
};

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

const updateEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

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

const getEmployeeMetrics = async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id, {
      attributes: [
        'id',
        'employeeId',
        'firstName',
        'lastName',
        'pickRate',
        'itemsPicked',
        'firstTimePickPercent',
        'preSubstitutionPercent',
        'postSubstitutionPercent',
        'percentNotFound',
        'onTimePercent',
        'weightedEfficiency'
      ]
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

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

const getMyAndStoreStats = async (req, res) => {
  try {
    if (req.userType !== 'employee') {
      return res.status(403).json({ message: 'Only employees can access employee statistics' });
    }

    const currentEmployee = await Employee.findByPk(req.user.id, {
      attributes: ['id', 'firstName', 'lastName', 'storeId', ...METRIC_FIELDS]
    });

    if (!currentEmployee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const storeEmployees = await Employee.findAll({
      where: {
        storeId: currentEmployee.storeId,
        isActive: true
      },
      attributes: ['id', ...METRIC_FIELDS]
    });

    const myStats = mapEmployeeStats(currentEmployee);
    const storeStats = getStoreAggregatedStats(storeEmployees);
    const walkHistory = await getCompletedPickWalkHistory(currentEmployee.id);
    const storeWalkHistory = await getCompletedPickWalkHistory(storeEmployees.map((employee) => employee.id));

    myStats.pickRate = calculateAverageWalkPickRate(walkHistory);
    storeStats.pickRate = calculateAverageWalkPickRate(storeWalkHistory);

    res.json({
      success: true,
      user: {
        id: currentEmployee.id,
        firstName: currentEmployee.firstName,
        lastName: currentEmployee.lastName,
        storeId: currentEmployee.storeId,
        stats: myStats,
        walkHistory
      },
      store: {
        employeeCount: storeEmployees.length,
        stats: storeStats
      }
    });
  } catch (error) {
    console.error('Get my/store stats error:', error);
    res.status(500).json({ message: 'Server error retrieving statistics' });
  }
};

module.exports = {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeMetrics,
  getMyAndStoreStats
};
