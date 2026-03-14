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
const { getEmployeeMetrics } = require('../../../controllers/employeeController');

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
        firstTimePickPercent: '95.00',
        preSubstitutionPercent: '90.00',
        postSubstitutionPercent: '98.00',
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
        'firstTimePickPercent',
        'preSubstitutionPercent',
        'postSubstitutionPercent',
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
