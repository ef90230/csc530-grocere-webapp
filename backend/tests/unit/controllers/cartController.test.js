jest.mock('../../../models', () => ({
  Cart: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn()
  },
  CartItem: {
    findOne: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn()
  },
  Item: {
    findByPk: jest.fn()
  },
  ItemLocation: {
    findAll: jest.fn()
  }
}));

const { Cart, CartItem, Item, ItemLocation } = require('../../../models');
const {
  getCart,
  addToCart,
  updateCartItem
} = require('../../../controllers/cartController');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createCartRecord = ({ id = 1, customerId = 25, storeId = 1, items = [] } = {}) => ({
  id,
  customerId,
  storeId,
  items,
  toJSON: () => ({
    id,
    customerId,
    storeId,
    items
  })
});

describe('cartController stock protections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('addToCart rejects items that are out of stock', async () => {
    const req = {
      params: { customerId: '25' },
      body: { itemId: 7, quantity: 1 }
    };
    const res = createMockRes();

    Item.findByPk.mockResolvedValue({ id: 7, name: 'Milk' });
    Cart.findOne.mockResolvedValue({ id: 10, customerId: 25, storeId: 1 });
    ItemLocation.findAll.mockResolvedValue([{ quantityOnHand: 0 }]);

    await addToCart(req, res);

    expect(CartItem.findOne).not.toHaveBeenCalled();
    expect(CartItem.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Item is out of stock' });
  });

  test('addToCart rejects requests that exceed current on hand', async () => {
    const req = {
      params: { customerId: '25' },
      body: { itemId: 7, quantity: 2 }
    };
    const res = createMockRes();

    Item.findByPk.mockResolvedValue({ id: 7, name: 'Milk' });
    Cart.findOne.mockResolvedValue({ id: 10, customerId: 25, storeId: 1 });
    CartItem.findOne.mockResolvedValue({
      id: 99,
      itemId: 7,
      quantity: 1,
      save: jest.fn()
    });
    ItemLocation.findAll.mockResolvedValue([{ quantityOnHand: 2 }]);

    await addToCart(req, res);

    expect(CartItem.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Requested quantity exceeds current stock' });
  });

  test('getCart removes cart items whose stock has fallen to zero', async () => {
    const req = { params: { customerId: '25' } };
    const res = createMockRes();
    const staleItem = {
      id: 101,
      itemId: 7,
      quantity: 1,
      item: { id: 7, price: 3.5 },
      destroy: jest.fn().mockResolvedValue(undefined)
    };
    const validItem = {
      id: 102,
      itemId: 8,
      quantity: 2,
      item: { id: 8, price: 4.0 },
      destroy: jest.fn().mockResolvedValue(undefined)
    };

    Cart.findOne.mockResolvedValue(createCartRecord({
      id: 10,
      customerId: 25,
      storeId: 1,
      items: [staleItem, validItem]
    }));
    Cart.findByPk.mockResolvedValue(createCartRecord({
      id: 10,
      customerId: 25,
      storeId: 1,
      items: [validItem]
    }));
    ItemLocation.findAll
      .mockResolvedValueOnce([{ quantityOnHand: 0 }])
      .mockResolvedValueOnce([{ quantityOnHand: 2 }]);

    await getCart(req, res);

    expect(staleItem.destroy).toHaveBeenCalledTimes(1);
    expect(validItem.destroy).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      cart: expect.objectContaining({
        itemCount: 1,
        totalQuantity: 2,
        subtotal: 8
      })
    });
  });

  test('updateCartItem rejects quantities above current on hand', async () => {
    const req = {
      params: { customerId: '25', cartItemId: '501' },
      body: { quantity: 4 }
    };
    const res = createMockRes();
    const cartItem = {
      id: 501,
      itemId: 7,
      quantity: 1,
      save: jest.fn()
    };

    Cart.findOne.mockResolvedValue({ id: 10, customerId: 25, storeId: 1 });
    CartItem.findOne.mockResolvedValue(cartItem);
    ItemLocation.findAll.mockResolvedValue([{ quantityOnHand: 3 }]);

    await updateCartItem(req, res);

    expect(cartItem.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Requested quantity exceeds current stock' });
  });
});
