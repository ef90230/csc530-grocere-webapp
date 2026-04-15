jest.mock('../../../models', () => ({
  Employee: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  Customer: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  Store: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn()
  }
}));

jest.mock('../../../middleware/auth', () => ({
  generateToken: jest.fn(() => 'mock-token')
}));

jest.mock('../../../utils/employeeTimeframeStatsService', () => ({
  getEmployeeTimeframeStats: jest.fn(async () => ({
    today: { pickRate: 72.5 }
  }))
}));

jest.mock('../../../utils/storeAdminAssignmentStore', () => ({
  getStoreAdminEmployeeId: jest.fn(() => null),
  assignStoreAdmin: jest.fn(),
  clearStoreAdmin: jest.fn(),
  isStoreAdminEmployee: jest.fn(() => false)
}));

const { Employee, Customer, Store } = require('../../../models');
const { generateToken } = require('../../../middleware/auth');
const {
  getEmployeeTimeframeStats
} = require('../../../utils/employeeTimeframeStatsService');
const {
  getStoreAdminEmployeeId,
  assignStoreAdmin,
  isStoreAdminEmployee
} = require('../../../utils/storeAdminAssignmentStore');
const {
  login,
  registerEmployee,
  registerCustomer,
  registerAdmin,
  getMe
} = require('../../../controllers/authController');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('authController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    generateToken.mockReturnValue('mock-token');
    getEmployeeTimeframeStats.mockResolvedValue({ today: { pickRate: 72.5 } });
    getStoreAdminEmployeeId.mockReturnValue(null);
    isStoreAdminEmployee.mockReturnValue(false);
  });

  test('login returns 401 when credentials are invalid', async () => {
    const req = {
      body: {
        email: 'missing@example.com',
        password: 'Password1!',
        userType: 'employee'
      }
    };
    const res = createMockRes();

    Employee.findOne.mockResolvedValue(null);

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
  });

  test('login returns token and user when credentials are valid', async () => {
    const req = {
      body: {
        email: 'alex@example.com',
        password: 'Password1!',
        userType: 'employee'
      }
    };
    const res = createMockRes();

    const user = {
      id: 12,
      isActive: true,
      comparePassword: jest.fn().mockResolvedValue(true),
      toJSON: jest.fn(() => ({ id: 12, email: 'alex@example.com', password: 'hashed' }))
    };

    Employee.findOne.mockResolvedValue(user);

    await login(req, res);

    expect(generateToken).toHaveBeenCalledWith(12, 'employee');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      token: 'mock-token',
      user: { id: 12, email: 'alex@example.com' }
    });
  });

  test('registerEmployee returns 400 when email already exists', async () => {
    const req = {
      body: {
        employeeId: 'EMP123',
        firstName: 'Alex',
        lastName: 'Picker',
        email: 'alex@example.com',
        password: 'Password1!',
        storeId: 1
      }
    };
    const res = createMockRes();

    Employee.findOne.mockResolvedValueOnce({ id: 5 });

    await registerEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Employee with this email already exists' });
  });

  test('registerEmployee returns preferred store not assigned when store does not exist', async () => {
    const req = {
      body: {
        employeeId: 'EMP123',
        firstName: 'Alex',
        lastName: 'Picker',
        email: 'alex@example.com',
        password: 'Password1!',
        storeId: 999
      }
    };
    const res = createMockRes();

    Employee.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    Store.findOne.mockResolvedValueOnce(null);
    Store.findByPk.mockResolvedValueOnce(null);

    await registerEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Preferred store number not assigned' });
  });

  test('registerCustomer returns 400 when customer id already exists', async () => {
    const req = {
      body: {
        customerId: 'CUST9',
        firstName: 'Sam',
        lastName: 'Shopper',
        email: 'sam@example.com',
        password: 'Password1!',
        phone: '5551234567'
      }
    };
    const res = createMockRes();

    Customer.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 88 });

    await registerCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Customer ID already exists' });
  });

  test('registerCustomer returns preferred store not assigned when store does not exist', async () => {
    const req = {
      body: {
        customerId: 'CUST9',
        firstName: 'Sam',
        lastName: 'Shopper',
        email: 'sam@example.com',
        password: 'Password1!',
        phone: '5551234567',
        preferredStoreId: '999'
      }
    };
    const res = createMockRes();

    Customer.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    Store.findOne.mockResolvedValueOnce(null);
    Store.findByPk.mockResolvedValueOnce(null);

    await registerCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Preferred store number not assigned' });
  });

  test('registerAdmin creates a store when preferred store number does not exist', async () => {
    const req = {
      body: {
        employeeId: 'ADM1',
        firstName: 'Ada',
        lastName: 'Min',
        email: 'admin@example.com',
        password: 'Password1!',
        storeId: '501'
      }
    };
    const res = createMockRes();

    Employee.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    Store.findOne.mockResolvedValueOnce(null);
    Store.findByPk.mockResolvedValueOnce(null);
    Store.create.mockResolvedValueOnce({ id: 55 });
    const createdEmployee = {
      id: 9,
      toJSON: () => ({ id: 9, email: 'admin@example.com', password: 'hashed', role: 'manager' })
    };
    Employee.create.mockResolvedValueOnce(createdEmployee);

    await registerAdmin(req, res);

    expect(Store.create).toHaveBeenCalled();
    expect(Employee.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'manager',
      storeId: 55
    }));
    expect(assignStoreAdmin).toHaveBeenCalledWith(55, 9);
    expect(generateToken).toHaveBeenCalledWith(9, 'admin');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('registerAdmin returns error when store already has an admin', async () => {
    const req = {
      body: {
        employeeId: 'ADM2',
        firstName: 'Ari',
        lastName: 'Admin',
        email: 'ari@example.com',
        password: 'Password1!',
        storeId: '700'
      }
    };
    const res = createMockRes();

    getStoreAdminEmployeeId.mockReturnValueOnce(100);
    Employee.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 100, isActive: true });
    Store.findOne.mockResolvedValueOnce({ id: 7, storeNumber: '700' });

    await registerAdmin(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Admin already assigned for that store' });
  });

  test('login returns 401 when logging in as admin with non-admin account', async () => {
    const req = {
      body: {
        email: 'alex@example.com',
        password: 'Password1!',
        userType: 'admin'
      }
    };
    const res = createMockRes();

    isStoreAdminEmployee.mockReturnValueOnce(false);
    Employee.findOne.mockResolvedValue({
      id: 12,
      role: 'picker',
      isActive: true,
      comparePassword: jest.fn().mockResolvedValue(true)
    });

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
  });

  test('getMe returns current user payload', async () => {
    const req = {
      userType: 'employee',
      user: {
        id: 1,
        toJSON: () => ({ id: 1, email: 'alex@example.com', pickRate: 999 })
      }
    };
    const res = createMockRes();

    await getMe(req, res);

    expect(getEmployeeTimeframeStats).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      userType: 'employee',
      user: { id: 1, email: 'alex@example.com', pickRate: 72.5 }
    });
  });

  test('getMe returns current customer payload without walk stats lookup', async () => {
    const req = {
      userType: 'customer',
      user: {
        toJSON: () => ({ id: 1, email: 'alex@example.com' })
      }
    };
    const res = createMockRes();

    await getMe(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      userType: 'customer',
      user: { id: 1, email: 'alex@example.com' }
    });
  });
});
