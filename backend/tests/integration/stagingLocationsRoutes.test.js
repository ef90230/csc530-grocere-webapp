process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const stagingLocationsRoutes = require('../../routes/stagingLocations');
const { generateToken } = require('../../middleware/auth');
const {
  sequelize,
  Store,
  Employee,
  Customer,
  Order,
  Item,
  OrderItem,
  StagingLocation,
  StagingAssignment
} = require('../../models');
const {
  getEmployeeDayTotals: getEmployeeItemsStagedDayTotals,
  getLocalDayKey: getItemsStagedDayKey
} = require('../../utils/employeeStagedItemsHistoryStore');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/staging-locations', stagingLocationsRoutes);
  return app;
};

const createStore = (storeNumber) => Store.create({
  storeNumber,
  name: `Store ${storeNumber}`,
  address: '123 Integration Ave',
  city: 'Testville',
  state: 'TS',
  zipCode: '12345',
  phone: '555-0100'
});

const seedBaseData = async () => {
  const store = await createStore('STG-1');
  const otherStore = await createStore('STG-2');

  const employee = await Employee.create({
    employeeId: 'STAGER-1',
    firstName: 'Stage',
    lastName: 'User',
    email: 'stager1@example.com',
    password: 'password123',
    role: 'stager',
    storeId: store.id
  });

  const otherStoreEmployee = await Employee.create({
    employeeId: 'STAGER-2',
    firstName: 'Other',
    lastName: 'Store',
    email: 'stager2@example.com',
    password: 'password123',
    role: 'stager',
    storeId: otherStore.id
  });

  const customer = await Customer.create({
    customerId: 'CUST-STG-1',
    firstName: 'Casey',
    lastName: 'Customer',
    email: 'customer-stg@example.com',
    password: 'password123',
    phone: '555-0133',
    preferredStoreId: store.id
  });

  const ambientItem = await Item.create({
    upc: '111111111111',
    name: 'Ambient Item',
    category: 'Grocery',
    department: 'Dry',
    price: 2.99,
    temperature: 'ambient',
    commodity: 'ambient'
  });

  const chilledItem = await Item.create({
    upc: '222222222222',
    name: 'Chilled Item',
    category: 'Dairy',
    department: 'Cooler',
    price: 4.99,
    temperature: 'chilled',
    commodity: 'chilled'
  });

  const ambientOrder1 = await Order.create({
    orderNumber: 'STG-ORD-001',
    customerId: customer.id,
    storeId: store.id,
    status: 'pending',
    scheduledPickupTime: new Date('2026-04-04T10:00:00Z'),
    totalAmount: 12.5
  });

  const ambientOrder2 = await Order.create({
    orderNumber: 'STG-ORD-002',
    customerId: customer.id,
    storeId: store.id,
    status: 'pending',
    scheduledPickupTime: new Date('2026-04-04T10:30:00Z'),
    totalAmount: 14.75
  });

  const chilledOrder = await Order.create({
    orderNumber: 'STG-ORD-003',
    customerId: customer.id,
    storeId: store.id,
    status: 'pending',
    scheduledPickupTime: new Date('2026-04-04T11:00:00Z'),
    totalAmount: 7.25
  });

  await OrderItem.bulkCreate([
    {
      orderId: ambientOrder1.id,
      itemId: ambientItem.id,
      quantity: 1,
      unitPrice: ambientItem.price,
      status: 'pending'
    },
    {
      orderId: ambientOrder2.id,
      itemId: ambientItem.id,
      quantity: 1,
      unitPrice: ambientItem.price,
      status: 'pending'
    },
    {
      orderId: chilledOrder.id,
      itemId: chilledItem.id,
      quantity: 1,
      unitPrice: chilledItem.price,
      status: 'pending'
    }
  ]);

  return {
    store,
    otherStore,
    ambientOrder1,
    ambientOrder2,
    chilledOrder,
    employeeToken: generateToken(employee.id, 'employee'),
    otherStoreEmployeeToken: generateToken(otherStoreEmployee.id, 'employee')
  };
};

describe('staging locations routes integration', () => {
  const app = buildApp();

  beforeEach(async () => {
    const historyFiles = [
      path.join(__dirname, '..', '..', 'database', 'employee-totes-history.json'),
      path.join(__dirname, '..', '..', 'database', 'employee-staged-items-history.json')
    ];

    historyFiles.forEach((historyFilePath) => {
      if (fs.existsSync(historyFilePath)) {
        fs.unlinkSync(historyFilePath);
      }
    });

    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('GET /api/staging-locations requires auth', async () => {
    const response = await request(app).get('/api/staging-locations');

    expect(response.status).toBe(401);
  });

  test('POST /api/staging-locations creates location with default limit and enforces unique name per store', async () => {
    const { employeeToken } = await seedBaseData();

    const createResponse = await request(app)
      .post('/api/staging-locations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Ambient A1',
        itemType: 'ambient'
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.location.name).toBe('Ambient A1');
    expect(createResponse.body.location.stagingLimit).toBe(10);

    const duplicateResponse = await request(app)
      .post('/api/staging-locations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'ambient a1',
        itemType: 'ambient'
      });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.message).toMatch(/already exists/i);
  });

  test('PATCH /api/staging-locations/options enforces minimum by fullest location and updates all limits', async () => {
    const { employeeToken, ambientOrder1, ambientOrder2 } = await seedBaseData();

    const locationCreate = await request(app)
      .post('/api/staging-locations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Ambient Rack',
        itemType: 'ambient'
      });

    const locationId = locationCreate.body.location.id;

    await request(app)
      .post('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder1.id,
        commodity: 'ambient',
        stagingLocationId: locationId
      });

    await request(app)
      .post('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder2.id,
        commodity: 'ambient',
        stagingLocationId: locationId
      });

    const lowLimitResponse = await request(app)
      .patch('/api/staging-locations/options')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ stagingLimit: 1 });

    expect(lowLimitResponse.status).toBe(400);
    expect(lowLimitResponse.body.message).toMatch(/cannot be less than 2/i);

    const validLimitResponse = await request(app)
      .patch('/api/staging-locations/options')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ stagingLimit: 2 });

    expect(validLimitResponse.status).toBe(200);
    expect(validLimitResponse.body.currentLimit).toBe(2);
    expect(validLimitResponse.body.minimumAllowedLimit).toBe(2);

    const persistedLocation = await StagingLocation.findByPk(locationId);
    expect(persistedLocation.stagingLimit).toBe(2);
  });

  test('POST /api/staging-locations/assignments rejects mismatched item type and full location', async () => {
    const { employeeToken, ambientOrder1, ambientOrder2 } = await seedBaseData();

    const chilledLocationCreate = await request(app)
      .post('/api/staging-locations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Cooler 1',
        itemType: 'chilled'
      });

    const chilledLocationId = chilledLocationCreate.body.location.id;

    const mismatchResponse = await request(app)
      .post('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder1.id,
        commodity: 'ambient',
        stagingLocationId: chilledLocationId
      });

    expect(mismatchResponse.status).toBe(400);
    expect(mismatchResponse.body.message).toMatch(/must match the item group type/i);

    await request(app)
      .patch('/api/staging-locations/options')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ stagingLimit: 1 });

    const ambientLocationCreate = await request(app)
      .post('/api/staging-locations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Ambient Bin',
        itemType: 'ambient'
      });

    const ambientLocationId = ambientLocationCreate.body.location.id;

    const firstAssignment = await request(app)
      .post('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder1.id,
        commodity: 'ambient',
        stagingLocationId: ambientLocationId
      });

    expect(firstAssignment.status).toBe(201);

    const fullLocationResponse = await request(app)
      .post('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder2.id,
        commodity: 'ambient',
        stagingLocationId: ambientLocationId
      });

    expect(fullLocationResponse.status).toBe(409);
    expect(fullLocationResponse.body.message).toMatch(/is full/i);
  });

  test('GET /api/staging-locations/:id/totes is store scoped and returns staged totes', async () => {
    const {
      employeeToken,
      otherStoreEmployeeToken,
      ambientOrder1
    } = await seedBaseData();

    const ambientLocationCreate = await request(app)
      .post('/api/staging-locations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Ambient Totes',
        itemType: 'ambient'
      });

    const ambientLocationId = ambientLocationCreate.body.location.id;

    await request(app)
      .post('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder1.id,
        commodity: 'ambient',
        stagingLocationId: ambientLocationId
      });

    const totesResponse = await request(app)
      .get(`/api/staging-locations/${ambientLocationId}/totes`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(totesResponse.status).toBe(200);
    expect(totesResponse.body.count).toBe(1);
    expect(totesResponse.body.totes[0].orderId).toBe(ambientOrder1.id);
    expect(totesResponse.body.totes[0].commodity).toBe('ambient');

    const otherStoreResponse = await request(app)
      .get(`/api/staging-locations/${ambientLocationId}/totes`)
      .set('Authorization', `Bearer ${otherStoreEmployeeToken}`);

    expect(otherStoreResponse.status).toBe(404);
  });

  test('DELETE /api/staging-locations/:id blocks delete when staged and allows after unassign', async () => {
    const { employeeToken, ambientOrder1 } = await seedBaseData();

    const ambientLocationCreate = await request(app)
      .post('/api/staging-locations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Delete Candidate',
        itemType: 'ambient'
      });

    const ambientLocationId = ambientLocationCreate.body.location.id;

    await request(app)
      .post('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder1.id,
        commodity: 'ambient',
        stagingLocationId: ambientLocationId
      });

    const blockedDelete = await request(app)
      .delete(`/api/staging-locations/${ambientLocationId}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body.message).toMatch(/cannot be deleted/i);

    await request(app)
      .delete('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder1.id,
        commodity: 'ambient'
      });

    const successfulDelete = await request(app)
      .delete(`/api/staging-locations/${ambientLocationId}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(successfulDelete.status).toBe(200);

    const remainingLocations = await StagingLocation.count();
    const remainingAssignments = await StagingAssignment.count();

    expect(remainingLocations).toBe(0);
    expect(remainingAssignments).toBe(0);
  });

  test('staging assignments update employee totesStaged and items staged metrics', async () => {
    const { employeeToken, ambientOrder1 } = await seedBaseData();

    const actingEmployee = await Employee.findOne({ where: { employeeId: 'STAGER-1' } });
    expect(Number(actingEmployee.totesStaged || 0)).toBe(0);

    await OrderItem.update(
      {
        quantity: 13,
        status: 'found',
        pickedQuantity: 13
      },
      {
        where: { orderId: ambientOrder1.id }
      }
    );

    const todayDayKey = getItemsStagedDayKey(new Date());
    const beforeItemsStagedHistory = getEmployeeItemsStagedDayTotals(actingEmployee.id);
    expect(Number(beforeItemsStagedHistory[todayDayKey] || 0)).toBe(0);

    const locationCreate = await request(app)
      .post('/api/staging-locations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Metric Bin',
        itemType: 'ambient'
      });

    const locationId = locationCreate.body.location.id;

    const stageResponse = await request(app)
      .post('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder1.id,
        commodity: 'ambient',
        stagingLocationId: locationId
      });

    expect(stageResponse.status).toBe(201);

    const afterStageEmployee = await Employee.findByPk(actingEmployee.id);
    expect(Number(afterStageEmployee.totesStaged || 0)).toBe(1);
    const afterStageItemsStagedHistory = getEmployeeItemsStagedDayTotals(actingEmployee.id);
    expect(Number(afterStageItemsStagedHistory[todayDayKey] || 0)).toBe(13);

    const unstageResponse = await request(app)
      .delete('/api/staging-locations/assignments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        orderId: ambientOrder1.id,
        commodity: 'ambient'
      });

    expect(unstageResponse.status).toBe(200);

    const afterUnstageEmployee = await Employee.findByPk(actingEmployee.id);
    expect(Number(afterUnstageEmployee.totesStaged || 0)).toBe(0);
    const afterUnstageItemsStagedHistory = getEmployeeItemsStagedDayTotals(actingEmployee.id);
    expect(Number(afterUnstageItemsStagedHistory[todayDayKey] || 0)).toBe(0);
  });
});