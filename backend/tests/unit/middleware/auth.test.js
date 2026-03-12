jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  sign: jest.fn(() => 'signed-token')
}));

jest.mock('../../../models', () => ({
  Employee: { findByPk: jest.fn() },
  Customer: { findByPk: jest.fn() }
}));

const jwt = require('jsonwebtoken');
const { Employee, Customer } = require('../../../models');
const { protect, restrictTo, generateToken } = require('../../../middleware/auth');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('protect returns 401 when token is missing', async () => {
    const req = { headers: {} };
    const res = createMockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Not authorized, no token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('protect loads employee user and calls next when token is valid', async () => {
    const req = { headers: { authorization: 'Bearer abc123' } };
    const res = createMockRes();
    const next = jest.fn();

    jwt.verify.mockReturnValue({ id: 7, type: 'employee' });
    Employee.findByPk.mockResolvedValue({ id: 7, role: 'manager' });

    await protect(req, res, next);

    expect(req.userType).toBe('employee');
    expect(req.user.id).toBe(7);
    expect(next).toHaveBeenCalled();
  });

  test('restrictTo blocks users without required role', () => {
    const req = {
      userType: 'employee',
      user: { role: 'picker' }
    };
    const res = createMockRes();
    const next = jest.fn();

    restrictTo('manager')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('restrictTo allows matching employee role', () => {
    const req = {
      userType: 'employee',
      user: { role: 'manager' }
    };
    const res = createMockRes();
    const next = jest.fn();

    restrictTo('manager', 'stager')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('generateToken delegates to jwt.sign', () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRE = '30d';

    const token = generateToken(10, 'employee');

    expect(jwt.sign).toHaveBeenCalledWith(
      { id: 10, type: 'employee' },
      'test-secret',
      { expiresIn: '30d' }
    );
    expect(token).toBe('signed-token');
  });
});
