jest.mock('../../../models', () => ({
  Item: {
    create: jest.fn(),
    findByPk: jest.fn()
  },
  ItemLocation: {
    destroy: jest.fn()
  },
  Location: {},
  Aisle: {},
  Store: {},
  Order: {
    update: jest.fn()
  },
  OrderItem: {
    findAll: jest.fn(),
    update: jest.fn()
  },
  sequelize: {
    transaction: jest.fn()
  }
}));

const { Op } = require('sequelize');
const { Item, ItemLocation, OrderItem, sequelize } = require('../../../models');
const {
  createItem,
  updateItem,
  deleteItem
} = require('../../../controllers/itemController');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('itemController commodity classification', () => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };

  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation(async (callback) => callback(transaction));
  });

  test('createItem keeps restricted above weight and temperature classification', async () => {
    const req = {
      body: {
        upc: '036000291452',
        name: 'Restricted Heavy Item',
        category: 'Specialty',
        department: 'General',
        price: 19.99,
        temperature: 'chilled',
        weight: 42,
        isRestricted: true
      }
    };
    const res = createMockRes();

    Item.create.mockResolvedValue({ id: 1, commodity: 'restricted' });

    await createItem(req, res);

    expect(Item.create).toHaveBeenCalledWith(expect.objectContaining({
      temperature: 'chilled',
      weight: 42,
      commodity: 'restricted'
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('updateItem preserves restricted classification when changing weight or temperature', async () => {
    const req = {
      params: { id: '7' },
      body: {
        temperature: 'hot',
        weight: 55
      }
    };
    const res = createMockRes();
    const item = {
      commodity: 'restricted',
      temperature: 'ambient',
      weight: 12,
      update: jest.fn().mockResolvedValue(undefined)
    };

    Item.findByPk.mockResolvedValue(item);

    await updateItem(req, res);

    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({
      temperature: 'hot',
      weight: 55,
      commodity: 'restricted'
    }));
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      item
    });
  });

  test('deleteItem clears substitute specifications that reference the deleted item', async () => {
    const req = {
      params: { id: '12' }
    };
    const res = createMockRes();
    const item = {
      update: jest.fn().mockResolvedValue(undefined)
    };

    Item.findByPk.mockResolvedValue(item);
    OrderItem.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 31,
          status: 'pending',
          order: {
            id: 8,
            status: 'pending'
          }
        },
        {
          id: 32,
          status: 'substituted',
          order: {
            id: 9,
            status: 'picking'
          }
        },
        {
          id: 33,
          status: 'pending',
          order: {
            id: 10,
            status: 'completed'
          }
        }
      ]);

    await deleteItem(req, res);

    expect(OrderItem.update).toHaveBeenCalledWith(
      {
        substitutedItemId: null
      },
      {
        where: {
          id: { [Op.in]: [31] }
        },
        transaction
      }
    );
    expect(ItemLocation.destroy).toHaveBeenCalledWith({
      where: { itemId: 12 },
      transaction
    });
    expect(item.update).toHaveBeenCalledWith(
      {
        isActive: false,
        unassignedQuantity: 0
      },
      { transaction }
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Item deleted from inventory and canceled in active orders.',
      canceledOrderCount: 0
    });
  });
});