const { syncDatabase, Store, Customer, Item, Employee, Order, OrderItem } = require('../../models');
const { updateEmployeeMetrics } = require('../../utils/employeeMetricsService');

describe('Employee metrics updates', () => {
  beforeAll(async () => {
    await syncDatabase(true);

    // create required store
    await Store.create({
      storeNumber: 'S1',
      name: 'Test Store',
      address: '123 Main St',
      city: 'Townsville',
      state: 'TS',
      zipCode: '12345',
      phone: '555-0000'
    });

    // create a customer and items required for order pacing
    await Customer.create({
      customerId: 'C1',
      firstName: 'Cust',
      lastName: 'One',
      email: 'cust1@example.com',
      password: 'password',
      phone: '555-0001'
    });

    await Item.create({
      upc: '000000000001',
      name: 'Test Item 1',
      category: 'Test',
      department: 'Test',
      price: 1.0,
      temperature: 'ambient',
      commodity: 'ambient'
    });

    await Item.create({
      upc: '000000000002',
      name: 'Test Item 2',
      category: 'Test',
      department: 'Test',
      price: 2.0,
      temperature: 'ambient',
      commodity: 'ambient'
    });
  });

  test('employee metric fields are clamped and never negative/over 100', async () => {
    const employee = await Employee.create({
      employeeId: 'E1',
      firstName: 'Test',
      lastName: 'Employee',
      email: 'test@example.com',
      password: 'password',
      storeId: 1
    });

    // Attempt to write invalid values and ensure validation prevents it
    let err;
    try {
      await employee.update({
        pickRate: -1,
        firstTimePickPercent: -10,
        preSubstitutionPercent: 110,
        postSubstitutionPercent: 120,
        onTimePercent: -1,
        weightedEfficiency: -10
      });
    } catch (e) {
      err = e;
    }

    expect(err).toBeDefined();
    expect(err.message).toMatch(/Validation|preSubstitutionPercent/);
  });

  test('metrics update after picking items updates in expected range', async () => {
    const employee = await Employee.create({
      employeeId: 'E2',
      firstName: 'Pick',
      lastName: 'Tester',
      email: 'pick@test.com',
      password: 'password',
      storeId: 1
    });

    const customer = await Customer.findOne({ where: { customerId: 'C1' } });

    const order = await Order.create({
      orderNumber: 'ORD-1',
      customerId: customer.id,
      storeId: 1,
      scheduledPickupTime: new Date('2025-01-01T10:00:00Z'),
      totalAmount: 0,
      assignedPickerId: employee.id
    });

    const item1 = await OrderItem.create({
      orderId: order.id,
      itemId: 1,
      quantity: 1,
      unitPrice: 1.0,
      status: 'pending'
    });

    const item2 = await OrderItem.create({
      orderId: order.id,
      itemId: 2,
      quantity: 1,
      unitPrice: 1.0,
      status: 'pending'
    });

    // Initial metrics should be all zeros
    await updateEmployeeMetrics(employee.id);
    await employee.reload();
    expect(Number(employee.pickRate)).toBe(0);
    expect(Number(employee.firstTimePickPercent)).toBe(0);
    expect(Number(employee.preSubstitutionPercent)).toBe(0);
    expect(Number(employee.postSubstitutionPercent)).toBe(0);
    expect(Number(employee.percentNotFound)).toBe(0);
    expect(Number(employee.weightedEfficiency)).toBe(0);

    // Simulate picking one item (found on first attempt)
    await item1.update({ status: 'found', attemptCount: 1, foundOnFirstAttempt: true });
    await updateEmployeeMetrics(employee.id);
    await employee.reload();

    expect(Number(employee.pickRate)).toBeGreaterThanOrEqual(1);
    expect(Number(employee.firstTimePickPercent)).toBeGreaterThanOrEqual(0);
    expect(Number(employee.firstTimePickPercent)).toBeLessThanOrEqual(100);
    expect(Number(employee.preSubstitutionPercent)).toBeLessThanOrEqual(Number(employee.postSubstitutionPercent));
    expect(Number(employee.postSubstitutionPercent)).toBeGreaterThanOrEqual(0);
    expect(Number(employee.postSubstitutionPercent)).toBeLessThanOrEqual(100);
    expect(Number(employee.weightedEfficiency)).toBeGreaterThanOrEqual(0);
    expect(Number(employee.weightedEfficiency)).toBeLessThanOrEqual(100);

    // Simulate substituting the second item
    await item2.update({ status: 'substituted', attemptCount: 2, foundOnFirstAttempt: false });
    await updateEmployeeMetrics(employee.id);
    await employee.reload();

    expect(Number(employee.pickRate)).toBeGreaterThanOrEqual(2);
    expect(Number(employee.firstTimePickPercent)).toBeGreaterThanOrEqual(0);
    expect(Number(employee.firstTimePickPercent)).toBeLessThanOrEqual(100);
    expect(Number(employee.preSubstitutionPercent)).toBeLessThanOrEqual(Number(employee.postSubstitutionPercent));
    expect(Number(employee.postSubstitutionPercent)).toBeGreaterThanOrEqual(0);
    expect(Number(employee.postSubstitutionPercent)).toBeLessThanOrEqual(100);
    expect(Number(employee.weightedEfficiency)).toBeGreaterThanOrEqual(0);
    expect(Number(employee.weightedEfficiency)).toBeLessThanOrEqual(100);
  });
});
