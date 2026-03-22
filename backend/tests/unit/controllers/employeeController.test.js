jest.mock('../../../models', () => ({
  Employee: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn()
  },
  Store: {},
  Order: {
    findAll: jest.fn()
  }
}));

const { Employee, Order } = require('../../../models');
const { getEmployeeMetrics, getMyAndStoreStats } = require('../../../controllers/employeeController');

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
        weightedEfficiency: '96.00'
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
        'weightedEfficiency'
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

  test('returns 500 when an unexpected error occurs', async () => {
    const req = { params: { id: '1' } };
    const res = createMockRes();

    Employee.findByPk.mockRejectedValue(new Error('db down'));

    await getEmployeeMetrics(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Server error retrieving metrics' });
  });
});

describe('employeeController.getMyAndStoreStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns the logged-in employee stats and store aggregates', async () => {
    const req = {
      userType: 'employee',
      user: { id: 3 }
    };
    const res = createMockRes();

    Employee.findByPk.mockResolvedValue({
      id: 3,
      firstName: 'Jane',
      lastName: 'Doe',
      storeId: 77,
      pickRate: '110.50',
      itemsPicked: 300,
      firstTimePickPercent: '94.00',
      preSubstitutionPercent: '95.00',
      postSubstitutionPercent: '99.00',
      percentNotFound: '6.00',
      onTimePercent: '100.00',
      weightedEfficiency: '91.00'
    });

    Employee.findAll.mockResolvedValue([
      {
        pickRate: '100.00',
        itemsPicked: 250,
        firstTimePickPercent: '92.00',
        preSubstitutionPercent: '94.00',
        postSubstitutionPercent: '98.00',
        percentNotFound: '8.00',
        onTimePercent: '100.00',
        weightedEfficiency: '89.00'
      },
      {
        pickRate: '110.00',
        itemsPicked: 350,
        firstTimePickPercent: '96.00',
        preSubstitutionPercent: '96.00',
        postSubstitutionPercent: '99.00',
        percentNotFound: '6.00',
        onTimePercent: '98.00',
        weightedEfficiency: '91.00'
      }
    ]);

    await getMyAndStoreStats(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: {
        id: 3,
        firstName: 'Jane',
        lastName: 'Doe',
        storeId: 77,
        stats: {
          pickRate: 110.5,
          itemsPicked: 300,
          firstTimePickPercent: 94,
          preSubstitutionPercent: 95,
          postSubstitutionPercent: 99,
          percentNotFound: 6,
          onTimePercent: 100,
          weightedEfficiency: 91
        }
      },
      store: {
        employeeCount: 2,
        stats: {
          pickRate: 105,
          itemsPicked: 600,
          firstTimePickPercent: 94,
          preSubstitutionPercent: 95,
          postSubstitutionPercent: 98.5,
          percentNotFound: 7,
          onTimePercent: 99,
          weightedEfficiency: 90
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
