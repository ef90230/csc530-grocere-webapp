jest.mock('../../../models', () => ({
  sequelize: {},
  StagingLocation: {},
  StagingAssignment: {
    findAll: jest.fn()
  },
  StagingLocationSetting: {},
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

const { Order, StagingAssignment } = require('../../../models');
const { getOrderTotesSummary } = require('../../../controllers/stagingLocationController');

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
            temperature: 'ambient'
          }
        },
        {
          id: 3,
          status: 'pending',
          item: {
            commodity: 'restricted',
            temperature: 'ambient'
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
      count: 2,
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
        })
      ]
    }));
  });
});