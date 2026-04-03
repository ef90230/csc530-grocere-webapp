jest.mock('../../../models', () => ({
  Order: {
    findByPk: jest.fn()
  },
  OrderItem: {
    findOne: jest.fn(),
    count: jest.fn()
  },
  Customer: {},
  Store: {},
  Employee: {},
  Item: {},
  ItemLocation: {
    findOne: jest.fn()
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

const { Order, OrderItem, ItemLocation } = require('../../../models');
const { updateEmployeeMetrics } = require('../../../utils/employeeMetricsService');
const {
  recordPick,
  updateOrderItem
} = require('../../../controllers/orderController');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('orderController completion flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});