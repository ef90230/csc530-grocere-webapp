import {
  calculateOrderTotalAtTimeOfOrdering,
  calculateCurrentEstimatedOrderTotal,
  deriveCustomerOrderStatus,
  getOrderToteCount,
  CUSTOMER_ORDER_PHASE
} from '../utils/customerOrderStatus';

describe('customer order total calculations', () => {
  test('keeps original total as quantity * original price at ordering time', () => {
    const order = {
      items: [
        {
          quantity: 2,
          pickedQuantity: 0,
          status: 'pending',
          item: { price: 3 }
        },
        {
          quantity: 1,
          pickedQuantity: 0,
          status: 'pending',
          item: { price: 5 }
        }
      ]
    };

    expect(calculateOrderTotalAtTimeOfOrdering(order)).toBe(11);
  });

  test('reduces current estimated total when original item is partially picked', () => {
    const order = {
      items: [
        {
          quantity: 2,
          pickedQuantity: 1,
          status: 'pending',
          item: { price: 3 }
        }
      ]
    };

    expect(calculateOrderTotalAtTimeOfOrdering(order)).toBe(6);
    expect(calculateCurrentEstimatedOrderTotal(order)).toBe(3);
  });

  test('replaces original value with substitute value when substitute is picked', () => {
    const order = {
      items: [
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'substituted',
          item: { price: 5 },
          substitutedItem: { price: 7 }
        }
      ]
    };

    expect(calculateOrderTotalAtTimeOfOrdering(order)).toBe(5);
    expect(calculateCurrentEstimatedOrderTotal(order)).toBe(7);
  });

  test('applies both not-picked and substitute-picked adjustments in one order', () => {
    const order = {
      items: [
        {
          quantity: 2,
          pickedQuantity: 1,
          status: 'pending',
          item: { price: 3 }
        },
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'substituted',
          item: { price: 5 },
          substitutedItem: { price: 7 }
        }
      ]
    };

    // 6 + 5 = 11 at ordering time.
    // Current estimate: 11 - (1 * 3 not picked of item A) - (1 * 5 original item B not picked) + (1 * 7 substitute picked) = 10
    expect(calculateOrderTotalAtTimeOfOrdering(order)).toBe(11);
    expect(calculateCurrentEstimatedOrderTotal(order)).toBe(10);
  });

  test('maps backend ready_for_pickup alias to STAGING COMPLETE before timeslot', () => {
    const order = {
      status: 'ready_for_pickup',
      items: [
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: { price: 5, commodity: 'ambient' }
        }
      ],
      scheduledPickupTime: '2026-04-05T10:30:00.000Z'
    };

    const phase = deriveCustomerOrderStatus(order, { now: '2026-04-05T10:00:00.000Z' });
    expect(phase).toBe(CUSTOMER_ORDER_PHASE.STAGING_COMPLETE);
  });

  test('maps backend ready_for_pickup alias to READY FOR PICKUP at or after timeslot', () => {
    const order = {
      status: 'ready_for_pickup',
      items: [
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: { price: 5, commodity: 'ambient' }
        }
      ],
      scheduledPickupTime: '2026-04-05T10:00:00.000Z'
    };

    const phase = deriveCustomerOrderStatus(order, { now: '2026-04-05T10:15:00.000Z' });
    expect(phase).toBe(CUSTOMER_ORDER_PHASE.READY_FOR_PICKUP);
  });

  test('maps backend staging_in_progress alias to STAGING IN PROGRESS customer phase', () => {
    const order = {
      status: 'staging_in_progress',
      items: [
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: { price: 5, commodity: 'ambient' }
        }
      ],
      scheduledPickupTime: '2026-04-05T12:00:00.000Z'
    };

    const phase = deriveCustomerOrderStatus(order, { now: '2026-04-05T11:00:00.000Z' });
    expect(phase).toBe(CUSTOMER_ORDER_PHASE.STAGING_IN_PROGRESS);
  });

  test('uses staged tote count to derive READY FOR PICKUP when backend status remains picked', () => {
    const order = {
      status: 'picked',
      stagedToteCount: 1,
      scheduledPickupTime: '2026-04-05T10:00:00.000Z',
      items: [
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: { price: 5, commodity: 'ambient' }
        }
      ]
    };

    const phase = deriveCustomerOrderStatus(order, { now: '2026-04-05T10:30:00.000Z' });
    expect(phase).toBe(CUSTOMER_ORDER_PHASE.READY_FOR_PICKUP);
  });

  test('prioritizes PICKING IN PROGRESS over STAGING IN PROGRESS when both conditions are true', () => {
    const order = {
      status: 'staging_in_progress',
      stagedToteCount: 1,
      scheduledPickupTime: '2026-04-05T12:00:00.000Z',
      items: [
        {
          quantity: 2,
          pickedQuantity: 1,
          status: 'pending',
          item: { price: 3, commodity: 'ambient' }
        }
      ]
    };

    const phase = deriveCustomerOrderStatus(order, { now: '2026-04-05T11:00:00.000Z' });
    expect(phase).toBe(CUSTOMER_ORDER_PHASE.PICKING_IN_PROGRESS);
  });

  test('uses staging temperature groups instead of raw commodity groups when deriving staged completion', () => {
    const order = {
      status: 'picked',
      stagedToteCount: 1,
      scheduledPickupTime: '2026-04-05T10:00:00.000Z',
      items: [
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: { price: 5, commodity: 'restricted', temperature: 'ambient' }
        },
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: { price: 6, commodity: 'oversized', temperature: 'ambient' }
        }
      ]
    };

    const phase = deriveCustomerOrderStatus(order, { now: '2026-04-05T10:30:00.000Z' });
    expect(phase).toBe(CUSTOMER_ORDER_PHASE.READY_FOR_PICKUP);
  });

  test('counts ambient-like items as one tote for staging totals', () => {
    const order = {
      items: [
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: { commodity: 'restricted', temperature: 'ambient' }
        },
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: { commodity: 'oversized', temperature: 'ambient' }
        },
        {
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: { commodity: 'ambient', temperature: 'ambient' }
        }
      ]
    };

    expect(getOrderToteCount(order)).toBe(1);
  });
});
