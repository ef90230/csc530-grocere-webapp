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

jest.mock('../../../controllers/alertController', () => ({
  createOrderCanceledAlert: jest.fn(),
  createPickerExitedWalkAlert: jest.fn(),
  syncItemOutOfStockAlerts: jest.fn(),
  upsertSystemAlert: jest.fn()
}));

const { Order, OrderItem, ItemLocation, StagingAssignment } = require('../../../models');
const { updateEmployeeMetrics } = require('../../../utils/employeeMetricsService');
const { createPickerExitedWalkAlert } = require('../../../controllers/alertController');
const {
  endPickWalk,
  recordPick,
  updateOrderItem,
  cancelOrder
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
});