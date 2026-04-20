const {
  validateScheduleTime,
  getAvailableTimeSlots,
  getNextAvailableSlot,
  purgeOldSchedules
} = require('../../utils/schedulingService');
const { syncDatabase, Store, Order } = require('../../models');
const { buildBackroomDoorLocationWithStoreSettings } = require('../../utils/storeSettings');

// helpers for date creation
const addHours = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000);
const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  // reset database
  await syncDatabase(true);
  // create a store for capacity tests - include all required fields
  await Store.create({
    storeNumber: 'S1',
    name: 'Test Store',
    address: '123 Main St',
    city: 'Townsville',
    state: 'TS',
    zipCode: '12345',
    phone: '555-0000'
  });
});

describe('schedulingService unit tests', () => {
  const now = new Date('2025-01-01T10:00:00Z'); // fixed "now" for deterministic tests

  test('rejects times outside operating hours', async () => {
    const storeId = 1;
    const invalid1 = new Date('2025-01-01T02:00:00Z'); // 2am
    const invalid2 = new Date('2025-01-01T07:59:59Z');
    const invalid3 = new Date('2025-01-02T00:00:00Z'); // midnight
    const valid = new Date('2025-01-01T08:00:00Z');

    expect((await validateScheduleTime(invalid1, storeId, now)).isValid).toBe(false);
    expect((await validateScheduleTime(invalid2, storeId, now)).isValid).toBe(false);
    expect((await validateScheduleTime(invalid3, storeId, now)).isValid).toBe(false);
    expect((await validateScheduleTime(valid, storeId, now)).isValid).toBe(true);
  });

  test('enforces minimum 3-hour advance requirement', async () => {
    const storeId = 1;
    const tooSoon = addHours(now, 2);
    const justEnough = addHours(now, 3);
    expect((await validateScheduleTime(tooSoon, storeId, now)).isValid).toBe(false);
    expect((await validateScheduleTime(justEnough, storeId, now)).isValid).toBe(true);
  });

  test('enforces maximum 7-days-out requirement', async () => {
    const storeId = 1;
    const farOut = addDays(now, 8);
    const boundary = addDays(now, 7);
    expect((await validateScheduleTime(farOut, storeId, now)).isValid).toBe(false);
    expect((await validateScheduleTime(boundary, storeId, now)).isValid).toBe(true);
  });

  test('capacity check rejects when 20 orders exist for hour', async () => {
    const storeId = 1;
    const hourSlot = new Date('2025-01-01T13:00:00Z');
    // insert 20 orders exactly at that hour
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        Order.create({
          orderNumber: `TEST-${i}`,
          customerId: null,
          storeId,
          scheduledPickupTime: hourSlot,
          totalAmount: 0
        })
      );
    }
    await Promise.all(promises);

    const validation = await validateScheduleTime(hourSlot, storeId, now);
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('Scheduling capacity exceeded for that hour');

    const later = addHours(hourSlot, 1);
    expect((await validateScheduleTime(later, storeId, now)).isValid).toBe(true);
  });

  test('existing orders keep a disabled slot they already occupy', async () => {
    const store = await Store.create({
      storeNumber: 'S2',
      name: 'Legacy Slot Store',
      address: '789 State St',
      city: 'Townsville',
      state: 'TS',
      zipCode: '12345',
      phone: '555-0001',
      backroomDoorLocation: buildBackroomDoorLocationWithStoreSettings(null, {
        scheduling: {
          timeZone: 'UTC',
          hoursByWeekday: {
            0: [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
            1: [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
            2: [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
            3: [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
            4: [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
            5: [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
            6: [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
          }
        }
      })
    });
    const disabledSlot = new Date('2025-01-01T13:00:00Z');
    const legacyOrder = await Order.create({
      orderNumber: 'LEGACY-13',
      customerId: null,
      storeId: store.id,
      scheduledPickupTime: disabledSlot,
      totalAmount: 0
    });

    const newBookingValidation = await validateScheduleTime(disabledSlot, store.id, now);
    expect(newBookingValidation.isValid).toBe(false);
    expect(newBookingValidation.errors).toContain('Orders can only be scheduled during the configured store hours');

    const legacyValidation = await validateScheduleTime(disabledSlot, store.id, now, {
      existingOrderId: legacyOrder.id
    });
    expect(legacyValidation.isValid).toBe(true);
    expect(legacyValidation.errors).toEqual([]);
  });

  test('getAvailableTimeSlots includes capacity info and respects hours', async () => {
    const storeId = 1;
    // create some orders to fill a slot
    const busyHour = new Date('2025-01-01T15:00:00Z');
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        Order.create({
          orderNumber: `B-${i}`,
          customerId: null,
          storeId,
          scheduledPickupTime: busyHour,
          totalAmount: 0
        })
      );
    }
    await Promise.all(promises);

    const slots = await getAvailableTimeSlots(storeId, '2025-01-01', '2025-01-02', now);
    expect(slots.length).toBeGreaterThan(0);
    const busySlot = slots.find((s) => s.hour === 15 || s.time.getUTCHours() === 15);
    expect(busySlot).toBeDefined();
    expect(busySlot.isAvailable).toBe(false);
    const earlySlot = slots.find((s) => s.hour === 2);
    expect(earlySlot).toBeUndefined();
  });

  test('getNextAvailableSlot returns earliest open hour', async () => {
    const storeId = 1;
    // after filling 13:00 and 15:00 above, next open should be 8am next day maybe
    const next = await getNextAvailableSlot(storeId, now);
    expect(next).not.toBeNull();
    expect(next.time.getUTCHours()).not.toBe(13);
    expect(next.time.getUTCHours()).not.toBe(15);
  });

  test('purgeOldSchedules removes only old orders', async () => {
    const storeId = 1;
    // create orders with a variety of scheduled times
    const oldOrder = await Order.create({
      orderNumber: 'OLD',
      customerId: null,
      storeId,
      scheduledPickupTime: new Date(now.getTime() - 49 * 60 * 60 * 1000),
      totalAmount: 0
    });
    const recentOrder = await Order.create({
      orderNumber: 'RECENT',
      customerId: null,
      storeId,
      scheduledPickupTime: new Date(now.getTime() - 40 * 60 * 60 * 1000),
      totalAmount: 0
    });

    const countBefore = await Order.count();
    const purged = await purgeOldSchedules();
    const countAfter = await Order.count();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(countAfter).toBe(countBefore - purged);
    const stillExists = await Order.findByPk(recentOrder.id);
    expect(stillExists).not.toBeNull();
  });
});
