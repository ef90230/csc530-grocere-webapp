jest.mock('../../../models', () => ({
  sequelize: {},
  StagingLocation: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  StagingAssignment: {
    findAll: jest.fn()
  },
  StagingLocationSetting: {
    findOrCreate: jest.fn()
  },
  Order: {
    findOne: jest.fn()
  },
  OrderItem: {},
  Item: {},
  Customer: {},
  Employee: {}
}));

jest.mock('../../../utils/employeeTotesHistoryStore', () => ({
  applyTotesDelta: jest.fn()
}));

jest.mock('../../../utils/employeeStagedItemsHistoryStore', () => ({
  applyItemsStagedDelta: jest.fn()
}));

const { Order, StagingAssignment, StagingLocation, StagingLocationSetting } = require('../../../models');
const { createLocation, getOrderTotesSummary } = require('../../../controllers/stagingLocationController');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('stagingLocationController temperature-based staging groups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('groups restricted and oversized items by temperature for staging summaries', async () => {
    const req = {
      params: { orderId: '10' },
      user: { storeId: 1 }
    };
    const res = createMockRes();

    Order.findOne.mockResolvedValue({
      id: 10,
      orderNumber: 'ORD-10',
      status: 'picked',
      scheduledPickupTime: '2026-04-15T18:00:00.000Z',
      customer: {
        firstName: 'Ari',
        lastName: 'Stone'
      },
      items: [
        {
          id: 1,
          status: 'found',
          item: {
            commodity: 'restricted',
            temperature: 'chilled'
          }
        },
        {
          id: 2,
          status: 'found',
          item: {
            commodity: 'oversized',
            temperature: 'ambient',
            weight: 25
          }
        },
        {
          id: 3,
          status: 'pending',
          item: {
            commodity: 'restricted',
            temperature: 'ambient',
            weight: 10
          }
        }
      ]
    });
    StagingAssignment.findAll.mockResolvedValue([
      {
        commodity: 'ambient',
        stagingLocation: {
          id: 4,
          name: 'Ambient Rack',
          itemType: 'ambient'
        }
      }
    ]);

    await getOrderTotesSummary(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      count: 3,
      totes: [
        expect.objectContaining({
          commodity: 'ambient',
          commodityLabel: 'Ambient',
          status: 'staged'
        }),
        expect.objectContaining({
          commodity: 'chilled',
          commodityLabel: 'Chilled',
          status: 'unstaged'
        }),
        expect.objectContaining({
          commodity: 'oversized',
          commodityLabel: 'Oversized',
          status: 'unstaged'
        })
      ]
    }));
  });

  test('allows admins to create oversized staging locations', async () => {
    const req = {
      user: { storeId: 1 },
      body: {
        name: 'Oversized Bay 1',
        itemType: 'oversized'
      }
    };
    const res = createMockRes();

    StagingLocation.findOne.mockResolvedValue(null);
    StagingLocationSetting.findOrCreate.mockResolvedValue([{ stagingLimit: 10 }]);
    StagingLocation.create.mockResolvedValue({
      id: 20,
      name: 'Oversized Bay 1',
      itemType: 'oversized',
      stagingLimit: 10
    });

    await createLocation(req, res);

    expect(StagingLocation.create).toHaveBeenCalledWith(expect.objectContaining({
      itemType: 'oversized'
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('keeps explicitly oversized picked items in an oversized tote even below the weight threshold', async () => {
    const req = {
      params: { orderId: '11' },
      user: { storeId: 1 }
    };
    const res = createMockRes();

    Order.findOne.mockResolvedValue({
      id: 11,
      orderNumber: 'ORD-11',
      status: 'picked',
      scheduledPickupTime: '2026-04-19T18:00:00.000Z',
      customer: {
        firstName: 'Taylor',
        lastName: 'Lane'
      },
      items: [
        {
          id: 10,
          status: 'found',
          item: {
            commodity: 'oversized',
            temperature: 'ambient',
            weight: 1
          }
        }
      ]
    });
    StagingAssignment.findAll.mockResolvedValue([]);

    await getOrderTotesSummary(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      count: 1,
      totes: [
        expect.objectContaining({
          commodity: 'oversized',
          commodityLabel: 'Oversized',
          status: 'unstaged'
        })
      ]
    }));
  });

  test('uses order notes staging overrides to keep a specific order item in an oversized tote', async () => {
    const req = {
      params: { orderId: '12' },
      user: { storeId: 1 }
    };
    const res = createMockRes();

    Order.findOne.mockResolvedValue({
      id: 12,
      orderNumber: 'ORD-12',
      status: 'picked',
      scheduledPickupTime: '2026-04-19T18:00:00.000Z',
      notes: JSON.stringify({
        stagingTypeByOrderItemId: {
          '500': 'oversized'
        }
      }),
      customer: {
        firstName: 'Jamie',
        lastName: 'Rowe'
      },
      items: [
        {
          id: 500,
          status: 'found',
          item: {
            commodity: 'restricted',
            temperature: 'ambient',
            weight: 1
          }
        }
      ]
    });
    StagingAssignment.findAll.mockResolvedValue([]);

    await getOrderTotesSummary(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      count: 1,
      totes: [
        expect.objectContaining({
          commodity: 'oversized',
          commodityLabel: 'Oversized',
          status: 'unstaged'
        })
      ]
    }));
  });
});