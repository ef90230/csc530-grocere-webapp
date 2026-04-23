jest.mock('../../../models', () => ({
  Employee: {
    findByPk: jest.fn(),
    findAll: jest.fn()
  },
  Store: {
    findByPk: jest.fn()
  },
  Order: {
    findAll: jest.fn()
  }
}));

jest.mock('../../../utils/employeeMetricsService', () => ({
  getCompletedPickWalkHistory: jest.fn()
}));

jest.mock('../../../utils/employeeTimeframeStatsService', () => ({
  getEmployeeTimeframeStats: jest.fn(),
  aggregateStoreStats: jest.fn(),
  getStoreWaitTimeStats: jest.fn(),
  EMPTY_STATS: {
    pickRate: 0,
    itemsPicked: 0,
    firstTimePickPercent: 0,
    preSubstitutionPercent: 0,
    postSubstitutionPercent: 0,
    percentNotFound: 0,
    onTimePercent: 0,
    weightedEfficiency: 0,
    totesStaged: 0,
    itemsStaged: 0,
    ordersDispensed: 0,
    totesDispensed: 0,
    itemsDispensed: 0
  }
}));

jest.mock('../../../utils/storeSettings', () => ({
  normalizeStoreSettings: jest.fn(() => ({
    goals: {
      pickRateGoal: {
        enabled: true,
        value: 100
      }
    }
  })),
  getStoreSettingsFromStore: jest.fn(() => ({
    goals: {
      pickRateGoal: {
        enabled: true,
        value: 100
      }
    }
  })),
  buildBackroomDoorLocationWithStoreSettings: jest.fn(),
  getTimeslotKeyFromDate: jest.fn()
}));

const { Employee, Store, Order } = require('../../../models');
const { getCompletedPickWalkHistory } = require('../../../utils/employeeMetricsService');
const {
  getEmployeeTimeframeStats,
  aggregateStoreStats,
  getStoreWaitTimeStats
} = require('../../../utils/employeeTimeframeStatsService');
const {
  getEmployeeMetrics,
  getMyAndStoreStats,
  getStoreSettings,
  updateStoreSettings
} = require('../../../controllers/employeeController');
const {
  normalizeStoreSettings,
  getStoreSettingsFromStore,
  buildBackroomDoorLocationWithStoreSettings,
  getTimeslotKeyFromDate
} = require('../../../utils/storeSettings');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('employeeController.getEmployeeMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns employee metrics and recent orders when employee exists', async () => {
    const req = { params: { id: '1' } };
    const res = createMockRes();

    const employeeRecord = {
      id: 1,
      toJSON: () => ({
        id: 1,
        employeeId: 'EMP001',
        firstName: 'Alex',
        lastName: 'Picker',
        pickRate: '92.00',
        itemsPicked: 412,
        firstTimePickPercent: '95.00',
        preSubstitutionPercent: '90.00',
        postSubstitutionPercent: '98.00',
        percentNotFound: '7.60',
        onTimePercent: '99.00',
        weightedEfficiency: '96.00',
        totesStaged: 9
      })
    };

    const recentOrders = [
      {
        id: 5,
        orderNumber: 'ORD-1005',
        status: 'picked'
      }
    ];

    Employee.findByPk.mockResolvedValue(employeeRecord);
    Order.findAll.mockResolvedValue(recentOrders);

    await getEmployeeMetrics(req, res);

    expect(Employee.findByPk).toHaveBeenCalledWith('1', {
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

    expect(Order.findAll).toHaveBeenCalledWith({
      where: { assignedPickerId: 1 },
      limit: 20,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'orderNumber', 'status', 'pickingStartTime', 'pickingEndTime']
    });

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      employee: {
        ...employeeRecord.toJSON(),
        recentOrders
      }
    });
  });

  test('returns 404 when employee is not found', async () => {
    const req = { params: { id: '999' } };
    const res = createMockRes();

    Employee.findByPk.mockResolvedValue(null);

    await getEmployeeMetrics(req, res);

    expect(Order.findAll).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Employee not found' });
  });
});

describe('employeeController.getMyAndStoreStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns logged-in employee and store stats including staging/dispensing totals', async () => {
    const req = {
      userType: 'employee',
      user: { id: 3 }
    };
    const res = createMockRes();

    const myToday = {
      pickRate: 98.3,
      itemsPicked: 37,
      firstTimePickPercent: 94.1,
      preSubstitutionPercent: 91.2,
      postSubstitutionPercent: 96.8,
      percentNotFound: 4.2,
      onTimePercent: 100,
      weightedEfficiency: 93.7,
      totesStaged: 5,
      itemsStaged: 41,
      ordersDispensed: 2,
      totesDispensed: 3,
      itemsDispensed: 39
    };

    const myAllTime = {
      ...myToday,
      itemsPicked: 400,
      totesStaged: 44,
      itemsStaged: 376,
      ordersDispensed: 22,
      totesDispensed: 33,
      itemsDispensed: 351
    };

    const storeToday = {
      ...myToday,
      pickRate: 101.2,
      itemsPicked: 89,
      totesStaged: 11,
      itemsStaged: 97,
      ordersDispensed: 5,
      totesDispensed: 8,
      itemsDispensed: 92
    };

    const storeAllTime = {
      ...storeToday,
      itemsPicked: 1210,
      totesStaged: 132,
      itemsStaged: 1140,
      ordersDispensed: 88,
      totesDispensed: 141,
      itemsDispensed: 1107
    };

    Employee.findByPk.mockResolvedValue({
      id: 3,
      firstName: 'Jane',
      lastName: 'Doe',
      storeId: 77
    });

    Employee.findAll.mockResolvedValue([
      { id: 3 },
      { id: 4 }
    ]);

    getEmployeeTimeframeStats
      .mockResolvedValueOnce({ today: myToday, allTime: myAllTime })
      .mockResolvedValueOnce({
        today: {
          ...myToday,
          itemsPicked: 52,
          totesStaged: 6,
          itemsStaged: 56,
          ordersDispensed: 3,
          totesDispensed: 5,
          itemsDispensed: 53
        },
        allTime: {
          ...myAllTime,
          itemsPicked: 810,
          totesStaged: 88,
          itemsStaged: 764,
          ordersDispensed: 66,
          totesDispensed: 108,
          itemsDispensed: 756
        }
      });

    aggregateStoreStats
      .mockReturnValueOnce(storeToday)
      .mockReturnValueOnce(storeAllTime);

    getStoreWaitTimeStats.mockReturnValue({
      today: {
        avgWaitTimeMinutes: 0,
        cumulativeWaitTimeMinutes: 0
      },
      allTime: {
        avgWaitTimeMinutes: 0,
        cumulativeWaitTimeMinutes: 0
      }
    });

    getCompletedPickWalkHistory.mockResolvedValue([
      {
        commodity: 'ambient',
        commodityLabel: 'Ambient',
        startedAt: '2026-04-10T10:00:00.000Z',
        endedAt: '2026-04-10T11:00:00.000Z',
        initialTotal: 12,
        itemsPicked: 10,
        orderCount: 2,
        pickRate: 10
      }
    ]);

    Store.findByPk.mockResolvedValue({
      id: 77,
      backroomDoorLocation: null
    });

    await getMyAndStoreStats(req, res);

    expect(getEmployeeTimeframeStats).toHaveBeenCalledTimes(2);
    expect(getEmployeeTimeframeStats).toHaveBeenNthCalledWith(1, 3, { timeZone: undefined });
    expect(getEmployeeTimeframeStats).toHaveBeenNthCalledWith(2, 4, { timeZone: undefined });
    expect(aggregateStoreStats).toHaveBeenNthCalledWith(1, [
      { employeeId: 3, today: myToday, allTime: myAllTime },
      {
        employeeId: 4,
        today: {
          ...myToday,
          itemsPicked: 52,
          totesStaged: 6,
          itemsStaged: 56,
          ordersDispensed: 3,
          totesDispensed: 5,
          itemsDispensed: 53
        },
        allTime: {
          ...myAllTime,
          itemsPicked: 810,
          totesStaged: 88,
          itemsStaged: 764,
          ordersDispensed: 66,
          totesDispensed: 108,
          itemsDispensed: 756
        }
      }
    ], 'today');

    expect(aggregateStoreStats).toHaveBeenNthCalledWith(2, [
      { employeeId: 3, today: myToday, allTime: myAllTime },
      {
        employeeId: 4,
        today: {
          ...myToday,
          itemsPicked: 52,
          totesStaged: 6,
          itemsStaged: 56,
          ordersDispensed: 3,
          totesDispensed: 5,
          itemsDispensed: 53
        },
        allTime: {
          ...myAllTime,
          itemsPicked: 810,
          totesStaged: 88,
          itemsStaged: 764,
          ordersDispensed: 66,
          totesDispensed: 108,
          itemsDispensed: 756
        }
      }
    ], 'allTime');

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: {
        id: 3,
        firstName: 'Jane',
        lastName: 'Doe',
        storeId: 77,
        stats: myToday,
        statsToday: myToday,
        statsAllTime: myAllTime,
        walkHistory: [
          {
            commodity: 'ambient',
            commodityLabel: 'Ambient',
            startedAt: '2026-04-10T10:00:00.000Z',
            endedAt: '2026-04-10T11:00:00.000Z',
            initialTotal: 12,
            itemsPicked: 10,
            orderCount: 2,
            pickRate: 10
          }
        ]
      },
      store: {
        employeeCount: 2,
        stats: {
          ...storeToday,
          avgWaitTimeMinutes: 0,
          cumulativeWaitTimeMinutes: 0
        },
        statsToday: {
          ...storeToday,
          avgWaitTimeMinutes: 0,
          cumulativeWaitTimeMinutes: 0
        },
        statsAllTime: {
          ...storeAllTime,
          avgWaitTimeMinutes: 0,
          cumulativeWaitTimeMinutes: 0
        },
        settings: {
          goals: {
            pickRateGoal: {
              enabled: true,
              value: 100
            }
          }
        }
      }
    });
  });

  test('returns 403 when requester is not an employee', async () => {
    const req = {
      userType: 'customer',
      user: { id: 9 }
    };
    const res = createMockRes();

    await getMyAndStoreStats(req, res);

    expect(Employee.findByPk).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Only employees can access employee statistics' });
  });
});

describe('employeeController store settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    normalizeStoreSettings.mockReturnValue({
      goals: {
        pickRateGoal: {
          enabled: true,
          value: 100
        }
      },
      timeslot: {
        defaultLimit: 20,
        overrides: {}
      },
      scheduling: {
        timeZone: 'UTC',
        hoursByWeekday: {}
      },
      storePhone: ''
    });
    getStoreSettingsFromStore.mockReturnValue({
      goals: {
        pickRateGoal: {
          enabled: true,
          value: 100
        }
      },
      timeslot: {
        defaultLimit: 20,
        overrides: {}
      },
      scheduling: {
        timeZone: 'UTC',
        hoursByWeekday: {}
      },
      storePhone: ''
    });
    buildBackroomDoorLocationWithStoreSettings.mockReturnValue({ __storeSettings: true });
    getTimeslotKeyFromDate.mockReturnValue('2026-04-21T12:00:00.000Z');
    Order.findAll.mockResolvedValue([]);
  });

  test('rejects non-admin access to store settings', async () => {
    const req = {
      userType: 'employee',
      authType: 'employee',
      user: { storeId: 1 }
    };
    const res = createMockRes();

    await getStoreSettings(req, res);

    expect(Store.findByPk).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Only admins can access store settings.' });
  });

  test('updates only the authenticated admin store name and settings', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const storeRecord = {
      id: 1,
      storeNumber: '001',
      name: 'Main Store',
      phone: '(555) 123-4567',
      backroomDoorLocation: { existing: true },
      update
    };

    Store.findByPk.mockResolvedValue(storeRecord);

    const req = {
      userType: 'employee',
      authType: 'admin',
      user: { storeId: 1 },
      body: {
        store: {
          name: 'Downtown Market'
        },
        settings: {
          timeslot: {
            defaultLimit: 20
          }
        }
      }
    };
    const res = createMockRes();

    await updateStoreSettings(req, res);

    expect(Store.findByPk).toHaveBeenCalledWith(1, {
      attributes: ['id', 'storeNumber', 'name', 'phone', 'backroomDoorLocation']
    });
    expect(update).toHaveBeenCalledWith({
      name: 'Downtown Market',
      backroomDoorLocation: { __storeSettings: true }
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Store settings updated successfully.',
      store: {
        id: 1,
        storeNumber: '001',
        name: 'Downtown Market'
      },
      settings: normalizeStoreSettings.mock.results[0].value
    });
  });
});
