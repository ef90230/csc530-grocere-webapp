const express = require('express');
const request = require('supertest');
const {
  loginValidation,
  passwordValidation,
  handleValidationErrors
} = require('../../../middleware/validation');

describe('validation middleware', () => {
  test('login validation rejects invalid email and empty password', async () => {
    const app = express();
    app.use(express.json());
    app.post('/login', loginValidation(), handleValidationErrors, (req, res) => {
      res.json({ success: true });
    });

    const response = await request(app)
      .post('/login')
      .send({ email: 'bad-email', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Validation failed');
    expect(Array.isArray(response.body.errors)).toBe(true);
  });

  test('login validation allows valid credentials payload', async () => {
    const app = express();
    app.use(express.json());
    app.post('/login', loginValidation(), handleValidationErrors, (req, res) => {
      res.json({ success: true });
    });

    const response = await request(app)
      .post('/login')
      .send({ email: 'user@example.com', password: 'Password1!' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('password validation enforces minimum length and complexity', async () => {
    process.env.MIN_PASSWORD_LENGTH = '10';

    const app = express();
    app.use(express.json());
    app.post('/register', passwordValidation(), handleValidationErrors, (req, res) => {
      res.json({ success: true });
    });

    const weak = await request(app)
      .post('/register')
      .send({ password: 'weak' });

    expect(weak.status).toBe(400);

    const strong = await request(app)
      .post('/register')
      .send({ password: 'StrongPwd1!' });

    expect(strong.status).toBe(200);
    expect(strong.body.success).toBe(true);
  });
});
