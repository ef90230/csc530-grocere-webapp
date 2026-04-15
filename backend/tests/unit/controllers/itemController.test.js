jest.mock('../../../models', () => ({
  Item: {
    create: jest.fn(),
    findByPk: jest.fn()
  },
  ItemLocation: {},
  Location: {},
  Aisle: {},
  Store: {},
  Order: {},
  OrderItem: {},
  sequelize: {}
}));

const { Item } = require('../../../models');
const {
  createItem,
  updateItem
} = require('../../../controllers/itemController');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('itemController commodity classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});