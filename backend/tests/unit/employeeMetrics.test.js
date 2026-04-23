jest.mock('../../models', () => ({
  Employee: {
    findByPk: jest.fn(),
    update: jest.fn()
  },
  Item: {},
  Order: {
    findAll: jest.fn()
  },
  OrderItem: {
    findAll: jest.fn()
  }
}));

jest.mock('../../utils/walkPerformanceStore', () => ({
  getWalkSummariesForEmployee: jest.fn(() => []),
  makeWalkKey: jest.fn(() => ''),
  getWalkFtprByKey: jest.fn(() => 0)
}));

const { Op } = require('sequelize');
const { Employee, Order, OrderItem } = require('../../models');
const { getWalkSummariesForEmployee } = require('../../utils/walkPerformanceStore');
const {
  calculateAverageWalkPickRate,
  calculateEmployeeMetrics,
  getCompletedPickWalkHistory,
  updateEmployeeMetrics
} = require('../../utils/employeeMetricsService');

describe('employeeMetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calculateAverageWalkPickRate returns the mean of completed walk rates', () => {
    expect(calculateAverageWalkPickRate([])).toBe(0);
    expect(calculateAverageWalkPickRate([
      { pickRate: 4 },
      { pickRate: 7 },
      { pickRate: 10 }
    ])).toBe(7);
  });

  test('getCompletedPickWalkHistory groups orders by walk start time and commodity', async () => {
    Order.findAll.mockResolvedValue([
      {
        pickingStartTime: '2026-03-30T10:00:00.000Z',
        pickingEndTime: '2026-03-30T11:00:00.000Z',
        items: [
          {
            quantity: 2,
            pickedQuantity: 2,
            item: { commodity: 'ambient' }
          },
          {
            quantity: 1,
            pickedQuantity: 1,
            item: { commodity: 'ambient' }
          }
        ]
      },
      {
        pickingStartTime: '2026-03-30T10:00:00.000Z',
        pickingEndTime: '2026-03-30T11:15:00.000Z',
        items: [
          {
            quantity: 3,
            pickedQuantity: 2,
            item: { commodity: 'ambient' }
          }
        ]
      },
      {
        pickingStartTime: '2026-03-29T08:00:00.000Z',
        pickingEndTime: '2026-03-29T10:00:00.000Z',
        items: [
          {
            quantity: 4,
            pickedQuantity: 4,
            item: { commodity: 'frozen' }
          }
        ]
      }
    ]);

    const walkHistory = await getCompletedPickWalkHistory(5);
    const orderQuery = Order.findAll.mock.calls[0][0];

    expect(orderQuery.where).toEqual({
      assignedPickerId: 5,
      pickingStartTime: { [Op.ne]: null },
      pickingEndTime: { [Op.ne]: null }
    });
    expect(orderQuery.attributes).toEqual(['id', 'assignedPickerId', 'pickingStartTime', 'pickingEndTime']);
    expect(orderQuery.order).toEqual([['pickingStartTime', 'DESC']]);

    expect(walkHistory).toEqual([
      {
        commodity: 'ambient',
        commodityLabel: 'Ambient',
        startedAt: '2026-03-30T10:00:00.000Z',
        endedAt: '2026-03-30T11:15:00.000Z',
        initialTotal: 6,
        itemsPicked: 5,
        orderCount: 2,
        pickRate: 4,
        firstTimePickRate: 0
      },
      {
        commodity: 'frozen',
        commodityLabel: 'Frozen',
        startedAt: '2026-03-29T08:00:00.000Z',
        endedAt: '2026-03-29T10:00:00.000Z',
        initialTotal: 4,
        itemsPicked: 4,
        orderCount: 1,
        pickRate: 2,
        firstTimePickRate: 0
      }
    ]);
  });

  test('updateEmployeeMetrics persists the average pick rate across completed walks', async () => {
    Employee.findByPk.mockResolvedValue({ id: 9 });
    OrderItem.findAll.mockResolvedValue([
      { status: 'found', foundOnFirstAttempt: true },
      { status: 'substituted', foundOnFirstAttempt: false },
      { status: 'skipped', foundOnFirstAttempt: false }
    ]);
    getWalkSummariesForEmployee.mockReturnValue([
      {
        totalQuantity: 3,
        originalPickedQuantity: 1,
        substitutedQuantity: 1,
        ftprMistakeQuantity: 1,
        mistakeQuantity: 1,
        firstTimePickRate: 66.67
      }
    ]);
    Order.findAll
      .mockResolvedValueOnce([
        {
          scheduledPickupTime: new Date('2026-03-30T12:00:00.000Z'),
          actualPickupTime: new Date('2026-03-30T11:50:00.000Z')
        },
        {
          scheduledPickupTime: new Date('2026-03-30T12:00:00.000Z'),
          actualPickupTime: new Date('2026-03-30T12:05:00.000Z')
        }
      ])
      .mockResolvedValueOnce([
        {
          pickingStartTime: '2026-03-30T09:00:00.000Z',
          pickingEndTime: '2026-03-30T10:00:00.000Z',
          items: [
            {
              quantity: 3,
              pickedQuantity: 3,
              item: { commodity: 'ambient' }
            }
          ]
        },
        {
          pickingStartTime: '2026-03-29T09:00:00.000Z',
          pickingEndTime: '2026-03-29T11:00:00.000Z',
          items: [
            {
              quantity: 4,
              pickedQuantity: 4,
              item: { commodity: 'frozen' }
            }
          ]
        }
      ]);

    const metrics = await updateEmployeeMetrics(9);

    expect(metrics.pickRate).toBe(2.5);
    expect(metrics.itemsPicked).toBe(2);
    expect(metrics.firstTimePickPercent).toBeCloseTo(66.67, 2);
    expect(metrics.preSubstitutionPercent).toBeCloseTo(33.33, 2);
    expect(metrics.postSubstitutionPercent).toBeCloseTo(66.67, 2);
    expect(metrics.percentNotFound).toBeCloseTo(33.33, 2);
    expect(metrics.onTimePercent).toBe(50);
    expect(Employee.update).toHaveBeenCalledWith(metrics, { where: { id: 9 } });
  });

  test('calculateEmployeeMetrics keeps not-found quantity after the final item status changes', async () => {
    Employee.findByPk.mockResolvedValue({ id: 11 });
    OrderItem.findAll.mockResolvedValue([
      { status: 'canceled', quantity: 2, pickedQuantity: 0, foundOnFirstAttempt: false },
      { status: 'found', quantity: 2, pickedQuantity: 2, foundOnFirstAttempt: true }
    ]);
    getWalkSummariesForEmployee.mockReturnValue([
      {
        totalQuantity: 4,
        originalPickedQuantity: 2,
        substitutedQuantity: 0,
        ftprMistakeQuantity: 2,
        mistakeQuantity: 2,
        firstTimePickRate: 50
      }
    ]);
    Order.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const metrics = await calculateEmployeeMetrics(11);

    expect(metrics.preSubstitutionPercent).toBe(50);
    expect(metrics.postSubstitutionPercent).toBe(50);
    expect(metrics.percentNotFound).toBe(50);
    expect(metrics.firstTimePickPercent).toBe(50);
  });
});
