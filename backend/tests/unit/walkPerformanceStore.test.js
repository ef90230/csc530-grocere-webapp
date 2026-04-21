let mockStoreJson = JSON.stringify({ walks: {} });

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => mockStoreJson),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn()
}));

const fs = require('fs');
const { getWalkSummariesForEmployee, recordFtprMistake, recordPickQuantity } = require('../../utils/walkPerformanceStore');

const loadStore = (store) => {
  mockStoreJson = JSON.stringify(store);
};

describe('walkPerformanceStore FTPR tracking', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(true);
    fs.writeFileSync.mockClear();
    fs.writeFileSync.mockImplementation((filePath, contents) => {
      mockStoreJson = contents;
    });
    loadStore({ walks: {} });
  });

  test('getWalkSummariesForEmployee computes FTPR from item quantities and binary first-attempt mistakes', () => {
    loadStore({
      walks: {
        '5::2026-04-20T10:00:00.000Z::ambient': {
          key: '5::2026-04-20T10:00:00.000Z::ambient',
          employeeId: 5,
          commodity: 'ambient',
          startedAt: '2026-04-20T10:00:00.000Z',
          closed: true,
          orderIds: [11],
          itemTotals: {
            '101': 3,
            '102': 2
          },
          itemMistakes: {
            '101': 1
          },
          itemFtprMistakeFlags: {
            '101': true
          },
          totalQuantity: 5,
          pickedQuantity: 2,
          originalPickedQuantity: 1,
          substitutedQuantity: 1
        }
      }
    });

    const [summary] = getWalkSummariesForEmployee(5);

    expect(summary.originalPickedQuantity).toBe(1);
    expect(summary.substitutedQuantity).toBe(1);
    expect(summary.mistakeQuantity).toBe(1);
    expect(summary.ftprMistakeQuantity).toBe(3);
    expect(summary.firstTimePickRate).toBe(40);
  });

  test('recordPickQuantity tracks substituted quantities separately from original picks', () => {
    loadStore({
      walks: {
        '5::2026-04-20T10:00:00.000Z::ambient': {
          key: '5::2026-04-20T10:00:00.000Z::ambient',
          employeeId: 5,
          commodity: 'ambient',
          startedAt: '2026-04-20T10:00:00.000Z',
          closed: false,
          orderIds: [11],
          itemTotals: {
            '101': 2,
            '102': 2
          },
          itemFtprMistakeFlags: {},
          itemFtprAttemptedFlags: {},
          totalQuantity: 4,
          pickedQuantity: 0,
          originalPickedQuantity: 0,
          substitutedQuantity: 0
        }
      }
    });

    recordPickQuantity({
      employeeId: 5,
      commodity: 'ambient',
      startedAt: '2026-04-20T10:00:00.000Z',
      orderItemId: 101,
      quantity: 2,
      pickKind: 'original'
    });

    recordPickQuantity({
      employeeId: 5,
      commodity: 'ambient',
      startedAt: '2026-04-20T10:00:00.000Z',
      orderItemId: 102,
      quantity: 1,
      pickKind: 'substituted'
    });

    const savedStore = JSON.parse(fs.writeFileSync.mock.calls[1][1]);
    const savedWalk = savedStore.walks['5::2026-04-20T10:00:00.000Z::ambient'];

    expect(savedWalk.pickedQuantity).toBe(3);
    expect(savedWalk.originalPickedQuantity).toBe(2);
    expect(savedWalk.substitutedQuantity).toBe(1);
  });

  test('recordFtprMistake only marks the first submission attempt for an item', () => {
    loadStore({
      walks: {
        '5::2026-04-20T10:00:00.000Z::ambient': {
          key: '5::2026-04-20T10:00:00.000Z::ambient',
          employeeId: 5,
          commodity: 'ambient',
          startedAt: '2026-04-20T10:00:00.000Z',
          closed: false,
          orderIds: [11],
          itemTotals: {
            '101': 2
          },
          itemFtprMistakeFlags: {},
          itemFtprAttemptedFlags: {
            '101': true
          },
          totalQuantity: 2,
          pickedQuantity: 0
        }
      }
    });

    recordFtprMistake({
      employeeId: 5,
      commodity: 'ambient',
      startedAt: '2026-04-20T10:00:00.000Z',
      orderItemId: 101,
      quantity: 2
    });

    const savedStore = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(savedStore.walks['5::2026-04-20T10:00:00.000Z::ambient'].itemFtprMistakeFlags).toEqual({});
  });
});