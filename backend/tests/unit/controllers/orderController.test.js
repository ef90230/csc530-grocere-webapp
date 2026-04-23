jest.mock('../../../models', () => ({
  Order: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    sequelize: {
      transaction: jest.fn()
    }
  },
  OrderItem: {
    findOne: jest.fn(),
    count: jest.fn(),
    update: jest.fn()
  },
  Customer: {},
  Store: {},
  Employee: {},
  Item: {},
  ItemLocation: {
    findOne: jest.fn()
  },
  StagingAssignment: {
    destroy: jest.fn()
  },
  PickPath: {
    findOne: jest.fn()
  },
  Location: {},
  Aisle: {}
}));

jest.mock('../../../utils/schedulingService', () => ({
  validateScheduleTime: jest.fn(),
  getAvailableTimeSlots: jest.fn(),
  getNextAvailableSlot: jest.fn(),
  purgeOldSchedules: jest.fn()
}));

jest.mock('../../../utils/employeeMetricsService', () => ({
  updateEmployeeMetrics: jest.fn()
}));

jest.mock('../../../utils/walkPerformanceStore', () => ({
  ensureWalk: jest.fn(),
  recordPickQuantity: jest.fn(),
  recordMistakeQuantity: jest.fn(),
  recordFtprMistake: jest.fn(),
  closeWalk: jest.fn(),
  closeLatestOpenWalk: jest.fn(),
  getOpenWalks: jest.fn(),
  getLatestOpenWalk: jest.fn()
}));

jest.mock('../../../controllers/alertController', () => ({
  createOrderCanceledAlert: jest.fn(),
  createPickerExitedWalkAlert: jest.fn(),
  syncItemOutOfStockAlerts: jest.fn(),
  upsertSystemAlert: jest.fn()
}));

const { Order, OrderItem, ItemLocation, StagingAssignment, PickPath } = require('../../../models');
const { updateEmployeeMetrics } = require('../../../utils/employeeMetricsService');
const { createPickerExitedWalkAlert } = require('../../../controllers/alertController');
const { ensureWalk, recordMistakeQuantity, recordFtprMistake, closeWalk, getOpenWalks, getLatestOpenWalk } = require('../../../utils/walkPerformanceStore');
const {
  getCommodityQueueForPicking,
  getCurrentPickWalk,
  getPickWalkList,
  startPickWalk,
  endPickWalk,
  recordPick,
  recordWalkMistake,
  updateOrderItem,
  cancelOrder,
  updateOrderStatus
} = require('../../../controllers/orderController');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('orderController completion flow', () => {
  const transaction = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined)
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Order.sequelize.transaction.mockResolvedValue(transaction);
    PickPath.findOne.mockResolvedValue(null);
    getOpenWalks.mockReturnValue([]);
  });

  test('startPickWalk claims at most eight orders and assigns symbols A-H', async () => {
    const req = {
      user: { id: 14 },
      body: {
        storeId: 3,
        commodity: 'ambient'
      }
    };
    const res = createMockRes();

    const pendingOrders = Array.from({ length: 9 }, (_, index) => ({
      id: index + 1,
      orderNumber: `ORD-0${index + 1}`,
      scheduledPickupTime: `2026-04-20T1${index}:00:00.000Z`,
      notes: null,
      items: [
        {
          id: 100 + index,
          quantity: 1,
          pickedQuantity: 0,
          status: 'pending',
          substitutedItem: null,
          item: {
            id: 200 + index,
            name: `Item ${index + 1}`,
            upc: `${index + 1}`,
            price: 1.99,
            imageUrl: '',
            commodity: 'ambient',
            unassignedQuantity: 0,
            locations: []
          }
        }
      ]
    }));

    Order.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(pendingOrders);
    Order.update = jest.fn().mockResolvedValue([
      8,
      pendingOrders.slice(0, 8).map((order) => ({ id: order.id }))
    ]);

    await startPickWalk(req, res);

    expect(Order.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'picking',
      assignedPickerId: 14,
      pickingStartTime: expect.any(Date)
    }), expect.objectContaining({
      where: {
        id: pendingOrders.slice(0, 8).map((order) => order.id),
        status: 'pending'
      },
      transaction
    }));
    expect(ensureWalk).toHaveBeenCalledWith(expect.objectContaining({
      orderSymbolsByOrderId: {
        1: 'A',
        2: 'B',
        3: 'C',
        4: 'D',
        5: 'E',
        6: 'F',
        7: 'G',
        8: 'H'
      }
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      resumed: false,
      claimedOrders: 8,
      totalItems: 8,
      queue: expect.arrayContaining([
        expect.objectContaining({ orderId: 1, orderNumber: 'ORD-01', orderSymbol: 'A' }),
        expect.objectContaining({ orderId: 8, orderNumber: 'ORD-08', orderSymbol: 'H' })
      ])
    }));
    expect(res.json.mock.calls[0][0].queue).toHaveLength(8);
  });

  test('startPickWalk keeps stored order symbols when a walk is resumed', async () => {
    const req = {
      user: { id: 14 },
      body: {
        storeId: 3,
        commodity: 'ambient'
      }
    };
    const res = createMockRes();

    const resumedOrders = [
      {
        id: 20,
        orderNumber: 'ORD-20',
        scheduledPickupTime: '2026-04-20T10:00:00.000Z',
        notes: null,
        pickingStartTime: '2026-04-20T09:55:00.000Z',
        items: [
          {
            id: 220,
            quantity: 1,
            pickedQuantity: 0,
            status: 'pending',
            substitutedItem: null,
            item: {
              id: 320,
              name: 'Avocados',
              upc: '111',
              price: 1.99,
              imageUrl: '',
              commodity: 'ambient',
              unassignedQuantity: 0,
              locations: []
            }
          }
        ]
      },
      {
        id: 21,
        orderNumber: 'ORD-21',
        scheduledPickupTime: '2026-04-20T10:10:00.000Z',
        notes: null,
        pickingStartTime: '2026-04-20T09:55:00.000Z',
        items: [
          {
            id: 221,
            quantity: 1,
            pickedQuantity: 0,
            status: 'pending',
            substitutedItem: null,
            item: {
              id: 321,
              name: 'Oranges',
              upc: '222',
              price: 2.99,
              imageUrl: '',
              commodity: 'ambient',
              unassignedQuantity: 0,
              locations: []
            }
          }
        ]
      }
    ];

    getLatestOpenWalk.mockReturnValue({
      employeeId: 14,
      storeId: 3,
      commodity: 'ambient',
      startedAt: '2026-04-20T09:55:00.000Z',
      pickedQuantity: 9,
      orderSymbolsByOrderId: {
        20: 'A',
        21: 'B'
      }
    });
    Order.findAll.mockResolvedValueOnce(resumedOrders);

    await startPickWalk(req, res);

    expect(ensureWalk).toHaveBeenCalledWith(expect.objectContaining({
      commodity: 'ambient',
      startedAt: '2026-04-20T09:55:00.000Z',
      orderSymbolsByOrderId: {
        20: 'A',
        21: 'B'
      }
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      resumed: true,
      walkStartedAt: '2026-04-20T09:55:00.000Z',
      completedUnits: 9,
      queue: [
        expect.objectContaining({ orderId: 20, orderSymbol: 'A' }),
        expect.objectContaining({ orderId: 21, orderSymbol: 'B' })
      ]
    }));
  });

  test('startPickWalk does not revive out-of-stock items when resuming a walk', async () => {
    const req = {
      user: { id: 14 },
      body: {
        storeId: 3,
        commodity: 'ambient'
      }
    };
    const res = createMockRes();

    const resumedOrders = [
      {
        id: 20,
        orderNumber: 'ORD-20',
        scheduledPickupTime: '2026-04-20T10:00:00.000Z',
        notes: null,
        pickingStartTime: '2026-04-20T09:55:00.000Z',
        items: [
          {
            id: 220,
            quantity: 1,
            pickedQuantity: 0,
            status: 'out_of_stock',
            substitutedItem: null,
            item: {
              id: 320,
              name: 'Avocados',
              upc: '111',
              price: 1.99,
              imageUrl: '',
              commodity: 'ambient',
              unassignedQuantity: 0,
              locations: []
            }
          }
        ]
      },
      {
        id: 21,
        orderNumber: 'ORD-21',
        scheduledPickupTime: '2026-04-20T10:10:00.000Z',
        notes: null,
        pickingStartTime: '2026-04-20T09:55:00.000Z',
        items: [
          {
            id: 221,
            quantity: 1,
            pickedQuantity: 0,
            status: 'pending',
            substitutedItem: null,
            item: {
              id: 321,
              name: 'Oranges',
              upc: '222',
              price: 2.99,
              imageUrl: '',
              commodity: 'ambient',
              unassignedQuantity: 0,
              locations: []
            }
          }
        ]
      }
    ];

    getLatestOpenWalk.mockReturnValue({
      employeeId: 14,
      storeId: 3,
      commodity: 'ambient',
      startedAt: '2026-04-20T09:55:00.000Z',
      pickedQuantity: 0,
      orderSymbolsByOrderId: {
        20: 'A',
        21: 'B'
      }
    });
    Order.findAll.mockResolvedValueOnce(resumedOrders);

    await startPickWalk(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      resumed: true,
      totalItems: 1,
      queue: [
        expect.objectContaining({
          orderId: 21,
          orderItemId: 221,
          status: 'pending',
          quantityToPick: 1
        })
      ]
    }));
  });

  test('recordPick finalizes the order when the last pending item is fully picked', async () => {
    const req = {
      body: {
        orderId: 10,
        orderItemId: 22,
        pickedQuantity: 1,
        locationId: 9
      }
    };
    const res = createMockRes();

    const orderItem = {
      itemId: 5,
      quantity: 1,
      pickedQuantity: 0,
      item: {
        commodity: 'ambient'
      },
      order: {
        assignedPickerId: 7,
        pickingStartTime: '2026-04-19T14:00:00.000Z',
        storeId: 3
      },
      update: jest.fn().mockResolvedValue(undefined)
    };
    const order = {
      assignedPickerId: 7,
      storeId: 3,
      status: 'picking',
      pickingEndTime: null,
      update: jest.fn().mockResolvedValue(undefined)
    };

    OrderItem.findOne.mockResolvedValue(orderItem);
    ItemLocation.findOne.mockResolvedValue(null);
    Order.findByPk.mockResolvedValue(order);
    OrderItem.count.mockResolvedValue(0);
    getOpenWalks.mockReturnValue([
      {
        commodity: 'ambient',
        employeeId: 7,
        storeId: 3,
        startedAt: '2026-04-19T14:00:00.000Z'
      }
    ]);
    closeWalk.mockReturnValue({ startedAt: '2026-04-19T14:00:00.000Z' });

    await recordPick(req, res);

    expect(orderItem.update).toHaveBeenCalledWith(expect.objectContaining({
      pickedQuantity: 1,
      status: 'found',
      pickedAt: expect.any(Date)
    }));
    expect(OrderItem.count).toHaveBeenCalledWith({
      where: {
        orderId: 10,
        status: 'pending'
      }
    });
    expect(order.update).toHaveBeenCalledWith({
      status: 'picked',
      pickingEndTime: expect.any(Date)
    });
    expect(closeWalk).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 7,
      commodity: 'ambient',
      startedAt: '2026-04-19T14:00:00.000Z'
    }));
    expect(updateEmployeeMetrics).toHaveBeenCalledWith(7);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      totalPicked: 1,
      isFullyPicked: true,
      remainingQuantity: 0
    });
  });

  test('updateOrderItem finalizes the order when the last pending item is resolved without a found status', async () => {
    const req = {
      params: {
        id: 12,
        itemId: 44
      },
      body: {
        status: 'out_of_stock',
        pickedQuantity: 0
      }
    };
    const res = createMockRes();

    const orderItem = {
      item: {
        commodity: 'ambient'
      },
      order: {
        assignedPickerId: 15,
        pickingStartTime: '2026-04-19T14:00:00.000Z',
        storeId: 2
      },
      update: jest.fn().mockResolvedValue(undefined)
    };
    const order = {
      assignedPickerId: 15,
      storeId: 2,
      status: 'picking',
      pickingEndTime: null,
      update: jest.fn().mockResolvedValue(undefined)
    };

    OrderItem.findOne.mockResolvedValue(orderItem);
    Order.findByPk.mockResolvedValue(order);
    OrderItem.count.mockResolvedValue(0);
    getOpenWalks.mockReturnValue([
      {
        commodity: 'ambient',
        employeeId: 15,
        storeId: 2,
        startedAt: '2026-04-19T14:00:00.000Z'
      }
    ]);
    closeWalk.mockReturnValue({ startedAt: '2026-04-19T14:00:00.000Z' });

    await updateOrderItem(req, res);

    expect(orderItem.update).toHaveBeenCalledWith({
      status: 'out_of_stock',
      pickedQuantity: 0
    });
    expect(order.update).toHaveBeenCalledWith({
      status: 'picked',
      pickingEndTime: expect.any(Date)
    });
    expect(closeWalk).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 15,
      commodity: 'ambient',
      startedAt: '2026-04-19T14:00:00.000Z'
    }));
    expect(updateEmployeeMetrics).toHaveBeenCalledWith(15);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      orderItem
    });
  });

  test('updateOrderItem preserves substitute linkage when the last item is partially substituted', async () => {
    const req = {
      params: {
        id: 19,
        itemId: 57
      },
      body: {
        status: 'substituted',
        substitutedItemId: 901,
        pickedQuantity: 1
      }
    };
    const res = createMockRes();

    const orderItem = {
      quantity: 3,
      pickedQuantity: 0,
      substitutedItemId: null,
      order: {
        assignedPickerId: 22,
        pickingStartTime: '2026-04-19T12:00:00.000Z'
      },
      item: {
        commodity: 'ambient'
      },
      update: jest.fn().mockImplementation(async (updateData) => {
        Object.assign(orderItem, updateData);
      })
    };
    const order = {
      assignedPickerId: 22,
      status: 'picking',
      pickingEndTime: null,
      update: jest.fn().mockResolvedValue(undefined)
    };

    OrderItem.findOne.mockResolvedValue(orderItem);
    Order.findByPk.mockResolvedValue(order);
    OrderItem.count.mockResolvedValue(0);

    await updateOrderItem(req, res);

    expect(orderItem.update).toHaveBeenCalledWith({
      status: 'substituted',
      substitutedItemId: 901,
      pickedQuantity: 1,
      pickedAt: expect.any(Date)
    });
    expect(order.update).toHaveBeenCalledWith({
      status: 'picked',
      pickingEndTime: expect.any(Date)
    });
    expect(updateEmployeeMetrics).toHaveBeenCalledWith(22);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      orderItem
    });
  });

  test('updateOrderStatus credits dispensing completion to the user who marks the order completed', async () => {
    const order = {
      assignedDispenserId: 11,
      actualPickupTime: null,
      update: jest.fn().mockResolvedValue(undefined)
    };

    Order.findByPk.mockResolvedValue(order);

    const dispensingReq = {
      params: { id: 88 },
      body: { status: 'dispensing' },
      user: { id: 11 }
    };
    const dispensingRes = createMockRes();

    await updateOrderStatus(dispensingReq, dispensingRes);

    expect(order.update).toHaveBeenNthCalledWith(1, {
      status: 'dispensing'
    });

    const completedReq = {
      params: { id: 88 },
      body: { status: 'completed' },
      user: { id: 27 }
    };
    const completedRes = createMockRes();

    await updateOrderStatus(completedReq, completedRes);

    expect(order.update).toHaveBeenNthCalledWith(2, {
      status: 'completed',
      actualPickupTime: expect.any(Date),
      assignedDispenserId: 27
    });
    expect(completedRes.json).toHaveBeenCalledWith({
      success: true,
      order
    });
  });

  test('cancelOrder removes staging assignments for every order sharing the same order number', async () => {
    const req = {
      params: {
        id: '15'
      }
    };
    const res = createMockRes();
    const order = {
      id: 15,
      storeId: 3,
      orderNumber: 'ORD-15',
      status: 'picking',
      update: jest.fn().mockResolvedValue(undefined)
    };

    Order.findByPk.mockResolvedValue(order);
    Order.findAll.mockResolvedValue([
      { id: 15 },
      { id: 16 }
    ]);

    await cancelOrder(req, res);

    expect(Order.findByPk).toHaveBeenCalledWith('15', { transaction });
    expect(order.update).toHaveBeenCalledWith({ status: 'cancelled' }, { transaction });
    expect(OrderItem.update).toHaveBeenCalledWith(
      { status: 'canceled' },
      {
        where: {
          orderId: 15,
          status: 'pending'
        },
        transaction
      }
    );
    expect(Order.findAll).toHaveBeenCalledWith({
      where: {
        storeId: 3,
        orderNumber: 'ORD-15'
      },
      attributes: ['id'],
      transaction
    });
    expect(StagingAssignment.destroy).toHaveBeenCalledWith({
      where: {
        storeId: 3,
        orderId: [15, 16]
      },
      transaction
    });
    expect(transaction.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Order cancelled successfully'
    });
  });

  test('endPickWalk does not create an early-exit alert when the walk ends normally', async () => {
    const req = {
      user: {
        id: 8,
        firstName: 'Normal',
        lastName: 'Finish'
      },
      body: {
        storeId: 2,
        commodity: 'ambient',
        endedEarly: false
      }
    };
    const res = createMockRes();

    Order.findAll.mockResolvedValue([
      {
        id: 30,
        orderNumber: 'ORD-30',
        pickingStartTime: '2026-04-18T10:00:00.000Z',
        items: [
          {
            id: 300,
            quantity: 1,
            pickedQuantity: 0
          }
        ]
      }
    ]);
    Order.update = jest.fn().mockResolvedValue([1]);

    await endPickWalk(req, res);

    expect(createPickerExitedWalkAlert).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      releasedOrders: 1,
      releasedItems: 1
    });
  });

  test('endPickWalk closes older stale open walks for the same commodity after an early exit', async () => {
    const req = {
      user: {
        id: 8,
        firstName: 'Early',
        lastName: 'Exit'
      },
      body: {
        storeId: 2,
        commodity: 'ambient',
        endedEarly: true
      }
    };
    const res = createMockRes();

    Order.findAll.mockResolvedValue([
      {
        id: 30,
        orderNumber: 'ORD-30',
        pickingStartTime: '2026-04-18T10:00:00.000Z',
        items: [
          {
            id: 300,
            quantity: 1,
            pickedQuantity: 0,
            item: {
              id: 500,
              commodity: 'ambient'
            }
          }
        ]
      }
    ]);
    Order.update = jest.fn().mockResolvedValue([1]);
    getOpenWalks.mockReturnValue([
      {
        commodity: 'ambient',
        employeeId: 8,
        storeId: 2,
        startedAt: '2026-04-18T09:00:00.000Z'
      }
    ]);

    await endPickWalk(req, res);

    expect(closeWalk).toHaveBeenNthCalledWith(1, expect.objectContaining({
      employeeId: 8,
      commodity: 'ambient',
      startedAt: '2026-04-18T10:00:00.000Z',
      extraMistakeQuantity: 1,
      mistakeOrderItemIds: ['300']
    }));
    expect(closeWalk).toHaveBeenNthCalledWith(2, expect.objectContaining({
      employeeId: 8,
      commodity: 'ambient',
      startedAt: '2026-04-18T09:00:00.000Z'
    }));
    expect(createPickerExitedWalkAlert).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 8,
      storeId: 2
    }));
  });

  test('getCommodityQueueForPicking keeps restricted visible when the active walk commodity is ambient', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' }
    };
    const res = createMockRes();

    getOpenWalks.mockReturnValue([
      {
        commodity: 'ambient',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-19T15:00:00.000Z'
      }
    ]);
    OrderItem.count.mockResolvedValue(1);

    Order.findAll.mockResolvedValue([
      {
        status: 'picking',
        orderNumber: 'ORD-200',
        scheduledPickupTime: '2026-04-19T16:00:00.000Z',
        items: [
          {
            quantity: 1,
            pickedQuantity: 0,
            item: { commodity: 'restricted' }
          },
          {
            quantity: 2,
            pickedQuantity: 0,
            item: { commodity: 'ambient' }
          }
        ]
      }
    ]);

    await getCommodityQueueForPicking(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      count: 1,
      commodities: [expect.objectContaining({
        commodity: 'restricted',
        itemCount: 1,
        dueItemCount: 1
      })]
    }));
  });

  test('getCurrentPickWalk reports the explicit open walk commodity instead of the first pending item commodity', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' }
    };
    const res = createMockRes();

    getOpenWalks.mockReturnValue([
      {
        commodity: 'ambient',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-19T15:00:00.000Z'
      }
    ]);

    Order.findAll.mockResolvedValue([
      {
        id: 200,
        orderNumber: 'ORD-200',
        items: [
          {
            quantity: 2,
            pickedQuantity: 1,
            item: { commodity: 'ambient' }
          }
        ]
      }
    ]);

    await getCurrentPickWalk(req, res);

    expect(Order.findAll).toHaveBeenCalledWith(expect.objectContaining({
      include: [expect.objectContaining({
        include: [expect.objectContaining({
          where: {
            commodity: 'ambient'
          }
        })]
      })]
    }));
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      hasActiveWalk: true,
      commodity: 'ambient',
      displayName: 'Ambient',
      totalItems: 1,
      orderCount: 1
    });
  });

  test('getCurrentPickWalk falls back from a newer stale walk to an older live chilled walk', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' }
    };
    const res = createMockRes();

    getOpenWalks.mockReturnValue([
      {
        commodity: 'frozen',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-20T10:00:00.000Z'
      },
      {
        commodity: 'chilled',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-20T09:55:00.000Z'
      }
    ]);

    Order.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 200,
          orderNumber: 'ORD-200',
          items: [
            {
              quantity: 2,
              pickedQuantity: 1,
              item: { commodity: 'chilled' }
            }
          ]
        }
      ]);

    await getCurrentPickWalk(req, res);

    expect(Order.findAll).toHaveBeenNthCalledWith(1, expect.objectContaining({
      include: [expect.objectContaining({
        include: [expect.objectContaining({
          where: {
            commodity: 'frozen'
          }
        })]
      })]
    }));
    expect(Order.findAll).toHaveBeenNthCalledWith(2, expect.objectContaining({
      include: [expect.objectContaining({
        include: [expect.objectContaining({
          where: {
            commodity: 'chilled'
          }
        })]
      })]
    }));
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      hasActiveWalk: true,
      commodity: 'chilled',
      displayName: 'Chilled',
      totalItems: 1,
      orderCount: 1
    });
  });

  test('getPickWalkList returns current walk items in walk order including resolved entries', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' }
    };
    const res = createMockRes();

    getOpenWalks.mockReturnValue([
      {
        commodity: 'ambient',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-19T15:00:00.000Z',
        orderIds: [200, 201],
        orderSymbolsByOrderId: {
          200: 'C',
          201: 'A'
        }
      }
    ]);
    PickPath.findOne.mockResolvedValueOnce({
      pathSequence: [12, 11]
    });
    Order.findAll.mockResolvedValue([
      {
        id: 200,
        orderNumber: 'ORD-200',
        scheduledPickupTime: '2026-04-19T16:00:00.000Z',
        notes: null,
        items: [
          {
            id: 301,
            quantity: 1,
            pickedQuantity: 1,
            status: 'found',
            substitutedItem: null,
            item: {
              id: 401,
              name: 'Bananas',
              upc: '111',
              price: 1.99,
              imageUrl: '',
              commodity: 'ambient',
              unassignedQuantity: 0,
              locations: [
                {
                  locationId: 11,
                  quantityOnHand: 8,
                  location: {
                    aisle: { aisleNumber: '4' },
                    section: 'S1',
                    shelf: '1',
                    coordinates: null
                  }
                }
              ]
            }
          }
        ]
      },
      {
        id: 201,
        orderNumber: 'ORD-201',
        scheduledPickupTime: '2026-04-19T16:05:00.000Z',
        notes: null,
        items: [
          {
            id: 302,
            quantity: 2,
            pickedQuantity: 0,
            status: 'pending',
            substitutedItem: null,
            item: {
              id: 402,
              name: 'Apples',
              upc: '222',
              price: 2.99,
              imageUrl: '',
              commodity: 'ambient',
              unassignedQuantity: 0,
              locations: [
                {
                  locationId: 12,
                  quantityOnHand: 4,
                  location: {
                    aisle: { aisleNumber: '2' },
                    section: 'S1',
                    shelf: '1',
                    coordinates: null
                  }
                }
              ]
            }
          }
        ]
      }
    ]);

    await getPickWalkList(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      hasActiveWalk: true,
      commodity: 'ambient',
      displayName: 'Ambient',
      walkStartedAt: '2026-04-19T15:00:00.000Z',
      completedUnits: 1,
      totalItems: 3,
      queue: [
        expect.objectContaining({
          orderId: 201,
          orderNumber: 'ORD-201',
          orderSymbol: 'A',
          orderItemId: 302,
          status: 'pending'
        }),
        expect.objectContaining({
          orderId: 200,
          orderNumber: 'ORD-200',
          orderSymbol: 'C',
          orderItemId: 301,
          status: 'found',
          quantityToPick: 0
        })
      ]
    }));
  });

  test('getPickWalkList keeps out-of-stock items resolved instead of reviving them into the walk', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' }
    };
    const res = createMockRes();

    getOpenWalks.mockReturnValue([
      {
        commodity: 'ambient',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-19T15:00:00.000Z',
        orderIds: [200],
        orderSymbolsByOrderId: {
          200: 'A'
        }
      }
    ]);
    PickPath.findOne.mockResolvedValue(null);
    Order.findAll.mockResolvedValue([
      {
        id: 200,
        orderNumber: 'ORD-200',
        scheduledPickupTime: '2026-04-19T16:00:00.000Z',
        notes: null,
        items: [
          {
            id: 301,
            quantity: 2,
            pickedQuantity: 0,
            status: 'out_of_stock',
            substitutedItem: null,
            item: {
              id: 401,
              name: 'Bananas',
              upc: '111',
              price: 1.99,
              imageUrl: '',
              commodity: 'ambient',
              unassignedQuantity: 0,
              locations: []
            }
          }
        ]
      }
    ]);

    await getPickWalkList(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      hasActiveWalk: true,
      totalItems: 2,
      queue: [
        expect.objectContaining({
          orderId: 200,
          status: 'out_of_stock',
          quantityToPick: 0
        })
      ]
    }));
  });

  test('getPickWalkList falls back from a newer stale walk to an older live chilled walk', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' }
    };
    const res = createMockRes();

    getOpenWalks.mockReturnValue([
      {
        commodity: 'frozen',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-20T10:00:00.000Z',
        orderIds: [300],
        orderSymbolsByOrderId: {
          300: 'A'
        }
      },
      {
        commodity: 'chilled',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-20T09:55:00.000Z',
        orderIds: [200],
        orderSymbolsByOrderId: {
          200: 'B'
        }
      }
    ]);
    PickPath.findOne.mockResolvedValue(null);
    Order.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 200,
          orderNumber: 'ORD-200',
          scheduledPickupTime: '2026-04-20T10:15:00.000Z',
          notes: null,
          items: [
            {
              id: 301,
              quantity: 2,
              pickedQuantity: 0,
              status: 'pending',
              substitutedItem: null,
              item: {
                id: 401,
                name: 'Whole Milk',
                upc: '111',
                price: 3.99,
                imageUrl: '',
                commodity: 'chilled',
                unassignedQuantity: 0,
                locations: []
              }
            }
          ]
        }
      ]);

    await getPickWalkList(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      hasActiveWalk: true,
      commodity: 'chilled',
      displayName: 'Chilled',
      walkStartedAt: '2026-04-20T09:55:00.000Z',
      completedUnits: 0,
      totalItems: 2,
      queue: [
        expect.objectContaining({
          orderId: 200,
          orderSymbol: 'B',
          status: 'pending'
        })
      ]
    }));
  });

  test('getPickWalkList returns the requested commodity walk when commodity is provided', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' },
      query: { commodity: 'chilled' }
    };
    const res = createMockRes();

    getOpenWalks.mockReturnValue([
      {
        commodity: 'chilled',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-20T09:55:00.000Z',
        orderIds: [200],
        orderSymbolsByOrderId: {
          200: 'B'
        }
      }
    ]);
    PickPath.findOne.mockResolvedValue(null);
    Order.findAll.mockResolvedValue([
      {
        id: 200,
        orderNumber: 'ORD-200',
        scheduledPickupTime: '2026-04-20T10:15:00.000Z',
        notes: null,
        items: [
          {
            id: 301,
            quantity: 3,
            pickedQuantity: 1,
            status: 'pending',
            substitutedItem: null,
            item: {
              id: 401,
              name: 'Whole Milk',
              upc: '111',
              price: 3.99,
              imageUrl: '',
              commodity: 'chilled',
              unassignedQuantity: 0,
              locations: []
            }
          }
        ]
      }
    ]);

    await getPickWalkList(req, res);

    expect(getOpenWalks).toHaveBeenCalledWith({
      employeeId: 12,
      storeId: '5',
      commodity: 'chilled'
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      hasActiveWalk: true,
      commodity: 'chilled',
      displayName: 'Chilled',
      walkStartedAt: '2026-04-20T09:55:00.000Z',
      completedUnits: 1,
      totalItems: 3,
      queue: [
        expect.objectContaining({
          orderId: 200,
          orderSymbol: 'B',
          pickedQuantity: 1,
          quantityToPick: 2,
          status: 'pending'
        })
      ]
    }));
  });

  test('getCommodityQueueForPicking excludes every commodity with an open walk', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' }
    };
    const res = createMockRes();

    getOpenWalks.mockReturnValue([
      {
        commodity: 'ambient',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-19T15:00:00.000Z'
      },
      {
        commodity: 'chilled',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-19T15:05:00.000Z'
      }
    ]);
    OrderItem.count.mockResolvedValue(1);

    Order.findAll.mockResolvedValue([
      {
        status: 'picking',
        orderNumber: 'ORD-200',
        scheduledPickupTime: '2026-04-19T16:00:00.000Z',
        items: [
          {
            quantity: 1,
            pickedQuantity: 0,
            item: { commodity: 'restricted' }
          },
          {
            quantity: 2,
            pickedQuantity: 0,
            item: { commodity: 'ambient' }
          },
          {
            quantity: 3,
            pickedQuantity: 0,
            item: { commodity: 'chilled' }
          }
        ]
      }
    ]);

    await getCommodityQueueForPicking(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      count: 1,
      commodities: [expect.objectContaining({
        commodity: 'restricted',
        itemCount: 1,
        dueItemCount: 1
      })]
    }));
  });

  test('getCommodityQueueForPicking closes stale open walks and returns that commodity to the queue', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' }
    };
    const res = createMockRes();

    getOpenWalks.mockReturnValue([
      {
        commodity: 'chilled',
        employeeId: 12,
        storeId: 5,
        startedAt: '2026-04-19T15:05:00.000Z'
      }
    ]);
    OrderItem.count.mockResolvedValue(0);
    closeWalk.mockReturnValue({ startedAt: '2026-04-19T15:05:00.000Z' });
    Order.findAll.mockResolvedValue([
      {
        status: 'pending',
        orderNumber: 'ORD-200',
        scheduledPickupTime: '2026-04-19T16:00:00.000Z',
        items: [
          {
            quantity: 3,
            pickedQuantity: 0,
            item: { commodity: 'chilled' }
          }
        ]
      }
    ]);

    await getCommodityQueueForPicking(req, res);

    expect(closeWalk).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 12,
      commodity: 'chilled',
      startedAt: '2026-04-19T15:05:00.000Z'
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      count: 1,
      commodities: [expect.objectContaining({
        commodity: 'chilled',
        itemCount: 3,
        dueItemCount: 3
      })]
    }));
  });

  test('recordWalkMistake records not-found quantity and FTPR mistake for not_found', async () => {
    const req = {
      user: { id: 8 },
      body: {
        orderId: 30,
        orderItemId: 300,
        quantity: 2,
        reason: 'not_found'
      }
    };
    const res = createMockRes();

    OrderItem.findOne.mockResolvedValue({
      order: {
        assignedPickerId: 8,
        pickingStartTime: '2026-04-18T10:00:00.000Z'
      },
      item: {
        commodity: 'ambient'
      }
    });

    await recordWalkMistake(req, res);

    expect(recordMistakeQuantity).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 8,
      quantity: 2,
      orderItemId: 300
    }));
    expect(recordFtprMistake).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 8,
      quantity: 2,
      orderItemId: 300
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('recordWalkMistake records only FTPR mistakes for skip errors', async () => {
    const req = {
      user: { id: 8 },
      body: {
        orderId: 31,
        orderItemId: 301,
        quantity: 1,
        reason: 'skip'
      }
    };
    const res = createMockRes();

    OrderItem.findOne.mockResolvedValue({
      order: {
        assignedPickerId: 8,
        pickingStartTime: '2026-04-18T10:00:00.000Z'
      },
      item: {
        commodity: 'ambient'
      }
    });

    await recordWalkMistake(req, res);

    expect(recordMistakeQuantity).not.toHaveBeenCalled();
    expect(recordFtprMistake).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 8,
      quantity: 1,
      orderItemId: 301
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});