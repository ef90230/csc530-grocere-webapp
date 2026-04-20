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
  PickPath: {},
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
  closeWalk: jest.fn(),
  closeLatestOpenWalk: jest.fn(),
  getLatestOpenWalk: jest.fn()
}));

jest.mock('../../../controllers/alertController', () => ({
  createOrderCanceledAlert: jest.fn(),
  createPickerExitedWalkAlert: jest.fn(),
  syncItemOutOfStockAlerts: jest.fn(),
  upsertSystemAlert: jest.fn()
}));

const { Order, OrderItem, ItemLocation, StagingAssignment } = require('../../../models');
const { updateEmployeeMetrics } = require('../../../utils/employeeMetricsService');
const { createPickerExitedWalkAlert } = require('../../../controllers/alertController');
const { getLatestOpenWalk } = require('../../../utils/walkPerformanceStore');
const {
  getCommodityQueueForPicking,
  getCurrentPickWalk,
  endPickWalk,
  recordPick,
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
      update: jest.fn().mockResolvedValue(undefined)
    };
    const order = {
      assignedPickerId: 7,
      status: 'picking',
      pickingEndTime: null,
      update: jest.fn().mockResolvedValue(undefined)
    };

    OrderItem.findOne.mockResolvedValue(orderItem);
    ItemLocation.findOne.mockResolvedValue(null);
    Order.findByPk.mockResolvedValue(order);
    OrderItem.count.mockResolvedValue(0);

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
      update: jest.fn().mockResolvedValue(undefined)
    };
    const order = {
      assignedPickerId: 15,
      status: 'picking',
      pickingEndTime: null,
      update: jest.fn().mockResolvedValue(undefined)
    };

    OrderItem.findOne.mockResolvedValue(orderItem);
    Order.findByPk.mockResolvedValue(order);
    OrderItem.count.mockResolvedValue(0);

    await updateOrderItem(req, res);

    expect(orderItem.update).toHaveBeenCalledWith({
      status: 'out_of_stock',
      pickedQuantity: 0
    });
    expect(order.update).toHaveBeenCalledWith({
      status: 'picked',
      pickingEndTime: expect.any(Date)
    });
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

  test('getCommodityQueueForPicking keeps restricted visible when the active walk commodity is ambient', async () => {
    const req = {
      user: { id: 12 },
      params: { storeId: '5' }
    };
    const res = createMockRes();

    getLatestOpenWalk.mockReturnValue({
      commodity: 'ambient',
      employeeId: 12,
      storeId: 5,
      startedAt: '2026-04-19T15:00:00.000Z'
    });

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

    getLatestOpenWalk.mockReturnValue({
      commodity: 'ambient',
      employeeId: 12,
      storeId: 5,
      startedAt: '2026-04-19T15:00:00.000Z'
    });

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
});