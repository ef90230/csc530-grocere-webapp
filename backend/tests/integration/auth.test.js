const express = require('express');
const request = require('supertest');

jest.mock('../../controllers/authController', () => ({
  login: jest.fn((req, res) => res.status(200).json({ success: true, route: 'login' })),
  registerEmployee: jest.fn((req, res) => res.status(201).json({ success: true, route: 'registerEmployee' })),
  registerCustomer: jest.fn((req, res) => res.status(201).json({ success: true, route: 'registerCustomer' })),
  getMe: jest.fn((req, res) => res.status(200).json({ success: true, route: 'me' }))
}));

jest.mock('../../middleware/auth', () => ({
  protect: jest.fn((req, res, next) => next())
}));

const { login, getMe } = require('../../controllers/authController');
const { protect } = require('../../middleware/auth');
const authRoutes = require('../../routes/auth');

describe('auth routes integration', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/auth/login rejects invalid payload via validation middleware', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bad-email', password: '' });

    expect(response.status).toBe(400);
    expect(login).not.toHaveBeenCalled();
  });

  test('POST /api/auth/login reaches controller on valid payload', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Password1!' });

    expect(response.status).toBe(200);
    expect(login).toHaveBeenCalled();
    expect(response.body.route).toBe('login');
  });

  test('GET /api/auth/me runs protect middleware and controller', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(protect).toHaveBeenCalled();
    expect(getMe).toHaveBeenCalled();
    expect(response.body.route).toBe('me');
  });
});
