jest.mock('../../../models', () => ({
  Employee: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  Customer: {
    findOne: jest.fn(),
    create: jest.fn()
  }
}));

jest.mock('../../../middleware/auth', () => ({
  generateToken: jest.fn(() => 'mock-token')
}));

const { Employee, Customer } = require('../../../models');
const { generateToken } = require('../../../middleware/auth');
const {
  login,
  registerEmployee,
  registerCustomer,
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
    jest.clearAllMocks();
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

  test('getMe returns current user payload', async () => {
    const req = {
      userType: 'employee',
      user: {
        toJSON: () => ({ id: 1, email: 'alex@example.com' })
      }
    };
    const res = createMockRes();

    await getMe(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      userType: 'employee',
      user: { id: 1, email: 'alex@example.com' }
    });
  });
});
