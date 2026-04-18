jest.mock('../../../models', () => ({
  Employee: {
    findByPk: jest.fn()
  },
  Item: {},
  ItemLocation: {},
  Order: {}
}));

jest.mock('../../../utils/alertStore', () => ({
  createAlert: jest.fn((input) => ({ id: `alert-${input.subtype}`, ...input })),
  dismissAlert: jest.fn(),
  listAlerts: jest.fn(() => []),
  upsertAlertBySourceKey: jest.fn()
}));

const { Employee } = require('../../../models');
const { createAlert } = require('../../../utils/alertStore');
const { createPickWalkReportAlerts } = require('../../../controllers/alertController');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('alertController pick walk report alerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates item and map alerts from selected pick walk report types', async () => {
    const req = {
      user: {
        id: 7,
        storeId: 3
      },
      body: {
        reportTypes: ['item_cannot_fit', 'item_appeared_out_of_order'],
        orderId: 11,
        itemId: 44,
        itemName: 'Bulk Rice Bag',
        locationLabel: 'Aisle 12 · Section B'
      }
    };
    const res = createMockRes();

    Employee.findByPk.mockResolvedValue({
      id: 7,
      firstName: 'Sam',
      lastName: 'Picker'
    });

    await createPickWalkReportAlerts(req, res);

    expect(createAlert).toHaveBeenCalledTimes(2);
    expect(createAlert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'item_report',
      title: 'Cannot Fit',
      subject: 'Bulk Rice Bag',
      message: 'Aisle 12 · Section B'
    }));
    expect(createAlert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'map_report',
      title: 'Out of Order',
      subject: 'Bulk Rice Bag',
      message: 'Aisle 12 · Section B'
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});