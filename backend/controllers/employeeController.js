const { Employee, Store, Order } = require('../models');
const { Op } = require('sequelize');
const {
  getCompletedPickWalkHistory
} = require('../utils/employeeMetricsService');
const {
  normalizeStoreSettings,
  getStoreSettingsFromStore,
  buildBackroomDoorLocationWithStoreSettings,
  getTimeslotKeyFromDate
} = require('../utils/storeSettings');
const {
  getEmployeeTimeframeStats,
  aggregateStoreStats,
  EMPTY_STATS
} = require('../utils/employeeTimeframeStatsService');

const METRIC_FIELDS = [
  'pickRate',
  'itemsPicked',
  'firstTimePickPercent',
  'preSubstitutionPercent',
  'postSubstitutionPercent',
  'percentNotFound',
  'onTimePercent',
  'weightedEfficiency',
  'totesStaged',
  'ordersDispensed'
];

const toNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const toInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const resolveStoreIdFromRequest = (req) => {
  const storeId = toInteger(req?.user?.storeId, 0);
  return storeId > 0 ? storeId : null;
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

    if (field === 'itemsPicked' || field === 'totesStaged' || field === 'ordersDispensed') {
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
        'weightedEfficiency',
        'totesStaged'
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
      attributes: ['id', 'firstName', 'lastName', 'storeId']
    });

    if (!currentEmployee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const storeEmployees = await Employee.findAll({
      where: {
        storeId: currentEmployee.storeId,
        isActive: true
      },
      attributes: ['id']
    });

    const employeeIds = storeEmployees.map((employee) => employee.id);
    const timeframeEntries = await Promise.all(employeeIds.map(async (employeeId) => {
      const stats = await getEmployeeTimeframeStats(employeeId);
      return {
        employeeId,
        ...stats
      };
    }));

    const myTimeframes = timeframeEntries.find((entry) => entry.employeeId === currentEmployee.id) || {
      employeeId: currentEmployee.id,
      today: { ...EMPTY_STATS },
      allTime: { ...EMPTY_STATS }
    };

    const myStats = myTimeframes.today;
    const myAllTimeStats = myTimeframes.allTime;
    const storeStats = aggregateStoreStats(timeframeEntries, 'today');
    const storeAllTimeStats = aggregateStoreStats(timeframeEntries, 'allTime');
    const walkHistory = await getCompletedPickWalkHistory(currentEmployee.id);

    const storeRecord = await Store.findByPk(currentEmployee.storeId, {
      attributes: ['id', 'backroomDoorLocation']
    });
    const storeSettings = storeRecord ? getStoreSettingsFromStore(storeRecord) : normalizeStoreSettings(null);

    res.json({
      success: true,
      user: {
        id: currentEmployee.id,
        firstName: currentEmployee.firstName,
        lastName: currentEmployee.lastName,
        storeId: currentEmployee.storeId,
        stats: myStats,
        statsToday: myStats,
        statsAllTime: myAllTimeStats,
        walkHistory
      },
      store: {
        employeeCount: storeEmployees.length,
        stats: storeStats,
        statsToday: storeStats,
        statsAllTime: storeAllTimeStats,
        settings: storeSettings
      }
    });
  } catch (error) {
    console.error('Get my/store stats error:', error);
    res.status(500).json({ message: 'Server error retrieving statistics' });
  }
};

const getStoreSettings = async (req, res) => {
  try {
    if (req.userType !== 'employee') {
      return res.status(403).json({ message: 'Only employees can access store settings.' });
    }

    const storeId = resolveStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'Employee store is required.' });
    }

    const store = await Store.findByPk(storeId, {
      attributes: ['id', 'storeNumber', 'name', 'backroomDoorLocation']
    });

    if (!store) {
      return res.status(404).json({ message: 'Store not found.' });
    }

    const settings = getStoreSettingsFromStore(store);

    return res.json({
      success: true,
      store: {
        id: store.id,
        storeNumber: store.storeNumber,
        name: store.name
      },
      settings
    });
  } catch (error) {
    console.error('Get store settings error:', error);
    return res.status(500).json({ message: 'Server error retrieving store settings' });
  }
};

const updateStoreSettings = async (req, res) => {
  try {
    if (req.userType !== 'employee') {
      return res.status(403).json({ message: 'Only employees can update store settings.' });
    }

    const storeId = resolveStoreIdFromRequest(req);
    if (!storeId) {
      return res.status(400).json({ message: 'Employee store is required.' });
    }

    const store = await Store.findByPk(storeId, {
      attributes: ['id', 'storeNumber', 'name', 'backroomDoorLocation']
    });

    if (!store) {
      return res.status(404).json({ message: 'Store not found.' });
    }

    const requestedSettings = normalizeStoreSettings(req.body?.settings);
    const existingSettings = getStoreSettingsFromStore(store);
    const currentDefaultLimit = toInteger(existingSettings?.timeslot?.defaultLimit, 20);
    const nextDefaultLimit = toInteger(requestedSettings?.timeslot?.defaultLimit, currentDefaultLimit);

    if (!Number.isInteger(nextDefaultLimit) || nextDefaultLimit < 1) {
      return res.status(400).json({ message: 'Timeslot order limit must be an integer greater than 0.' });
    }

    const activeOrders = await Order.findAll({
      where: {
        storeId,
        status: {
          [Op.notIn]: ['cancelled', 'completed']
        },
        scheduledPickupTime: {
          [Op.gte]: new Date()
        }
      },
      attributes: ['scheduledPickupTime']
    });

    const orderCountByTimeslotKey = activeOrders.reduce((accumulator, order) => {
      const slotKey = getTimeslotKeyFromDate(order?.scheduledPickupTime);
      if (!slotKey) {
        return accumulator;
      }

      accumulator[slotKey] = (accumulator[slotKey] || 0) + 1;
      return accumulator;
    }, {});

    const currentOverrides = existingSettings?.timeslot?.overrides || {};
    const nextOverrides = Object.entries(orderCountByTimeslotKey).reduce((accumulator, [slotKey, slotCount]) => {
      const count = toInteger(slotCount, 0);
      const currentEffectiveLimit = toInteger(currentOverrides[slotKey], currentDefaultLimit);

      if (count <= nextDefaultLimit) {
        return accumulator;
      }

      accumulator[slotKey] = Math.max(currentEffectiveLimit, count);
      return accumulator;
    }, {});

    const nextSettings = normalizeStoreSettings({
      ...requestedSettings,
      timeslot: {
        ...requestedSettings.timeslot,
        defaultLimit: nextDefaultLimit,
        overrides: nextOverrides
      }
    });

    await store.update({
      backroomDoorLocation: buildBackroomDoorLocationWithStoreSettings(store.backroomDoorLocation, nextSettings)
    });

    return res.json({
      success: true,
      message: 'Store settings updated successfully.',
      store: {
        id: store.id,
        storeNumber: store.storeNumber,
        name: store.name
      },
      settings: nextSettings
    });
  } catch (error) {
    console.error('Update store settings error:', error);
    return res.status(500).json({ message: 'Server error updating store settings' });
  }
};

module.exports = {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeMetrics,
  getMyAndStoreStats,
  getStoreSettings,
  updateStoreSettings
};
