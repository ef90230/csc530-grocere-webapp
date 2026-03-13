const request = require('supertest');
const app = require('../../server');
const { syncDatabase, Store, Order, Customer, Employee } = require('../../models');

let customerToken;
let managerToken;
let storeId;

beforeAll(async () => {
  await syncDatabase(true);
  const store = await Store.create({
    storeNumber: 'INT1',
    name: 'Integration Store',
    address: '456 Ave',
    city: 'City',
    state: 'CS',
    zipCode: '67890',
    phone: '555-1111'
  });
  storeId = store.id;

  // register a customer and login
  await request(app)
    .post('/api/auth/register/customer')
    .send({
      customerId: 'CUST1',
      firstName: 'Test',
      lastName: 'Customer',
      email: 'cust@example.com',
      password: 'password123',
      phone: '555-0123',
      preferredStoreId: storeId
    });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'cust@example.com', password: 'password123', userType: 'customer' });
  customerToken = loginRes.body.token;

  // register manager employee
  await request(app)
    .post('/api/auth/register/employee')
    .send({
      employeeId: 'EMP1',
      firstName: 'Manager',
      lastName: 'User',
      email: 'mgr@example.com',
      password: 'managerpwd',
      role: 'manager',
      storeId
    });

  const mgrLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'mgr@example.com', password: 'managerpwd', userType: 'employee' });
  managerToken = mgrLogin.body.token;
});

describe('scheduling endpoints (integration/e2e)', () => {
  test('GET slots returns sensible structure and requires auth', async () => {
    const resNoAuth = await request(app).get(`/api/orders/scheduling/slots/${storeId}`);
    expect(resNoAuth.status).toBe(401);

    const res = await request(app)
      .get(`/api/orders/scheduling/slots/${storeId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ startDate: '2025-01-01', endDate: '2025-01-03' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('validate endpoint accept/deny times', async () => {
    const tooEarly = '2025-01-01T02:00:00Z';
    const validTime = '2025-01-01T08:00:00Z';

    const invalidRes = await request(app)
      .post(`/api/orders/scheduling/validate/${storeId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ scheduledPickupTime: tooEarly });
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.isValid).toBe(false);

    const validRes = await request(app)
      .post(`/api/orders/scheduling/validate/${storeId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ scheduledPickupTime: validTime });
    expect(validRes.status).toBe(200);
    expect(validRes.body.isValid).toBe(true);
  });

  test('creating an order enforces scheduling rules', async () => {
    const badOrder = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        customerId: 1,
        storeId,
        scheduledPickupTime: '2025-01-01T02:00:00Z',
        items: []
      });
    expect(badOrder.status).toBe(400);
    expect(badOrder.body.message).toMatch(/Invalid scheduled pickup time/);

    const goodOrder = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        customerId: 1,
        storeId,
        scheduledPickupTime: '2025-01-01T08:00:00Z',
        items: []
      });
    expect(goodOrder.status).toBe(201);
  });

  test('capacity is enforced via order endpoint', async () => {
    // fill 20 orders at 2025-01-01T10:00:00Z
    for (let i = 0; i < 20; i++) {
      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customerId: 1,
          storeId,
          scheduledPickupTime: '2025-01-01T10:00:00Z',
          items: []
        });
    }
    const overflow = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        customerId: 1,
        storeId,
        scheduledPickupTime: '2025-01-01T10:00:00Z',
        items: []
      });
    expect(overflow.status).toBe(400);
  });

  test('manager purge endpoint clears old orders', async () => {
    // create one old order
    await Order.create({
      orderNumber: 'PURGE_TEST',
      customerId: 1,
      storeId,
      scheduledPickupTime: new Date('2024-12-28T09:00:00Z'),
      totalAmount: 0
    });

    const purgeResult = await request(app)
      .post('/api/orders/scheduling/purge')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(purgeResult.status).toBe(200);
    expect(purgeResult.body.purgedCount).toBeGreaterThan(0);
  });
});
