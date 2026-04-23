jest.mock('../../models', () => ({
  Order: {
    findAll: jest.fn()
  },
  OrderItem: {
    findAll: jest.fn()
  },
  Item: {}
}));

jest.mock('../../utils/employeeMetricsService', () => ({
  getCompletedPickWalkHistory: jest.fn()
}));

jest.mock('../../utils/employeeTotesHistoryStore', () => ({
  getEmployeeDayTotals: jest.fn(() => ({})),
  getLocalDayKey: jest.fn(() => '2026-04-19')
}));

jest.mock('../../utils/employeeStagedItemsHistoryStore', () => ({
  getEmployeeDayTotals: jest.fn(() => ({}))
}));

jest.mock('../../utils/walkPerformanceStore', () => ({
  getWalkSummariesForEmployee: jest.fn(() => [])
}));

jest.mock('../../utils/storeWaitTimeHistoryStore', () => ({
  getStoreDayTotals: jest.fn(() => ({})),
  getLocalDayKey: jest.fn(() => '2026-04-19')
}));

const { Order } = require('../../models');
const { getCompletedPickWalkHistory } = require('../../utils/employeeMetricsService');
const { getWalkSummariesForEmployee } = require('../../utils/walkPerformanceStore');
const {
  aggregateStoreStats,
  buildAllTimeFromDayStats,
  EMPTY_STATS,
  getEmployeeTimeframeStats
} = require('../../utils/employeeTimeframeStatsService');

describe('employeeTimeframeStatsService.aggregateStoreStats', () => {
  const withFtprMeta = (stats, numerator, denominator) => {
    Object.defineProperty(stats, '__ftprNumerator', {
      value: numerator,
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(stats, '__ftprDenominator', {
      value: denominator,
      enumerable: false,
      configurable: true,
      writable: true
    });
    return stats;
  };

  const withPercentNotFoundMeta = (stats, numerator, denominator) => {
    Object.defineProperty(stats, '__percentNotFoundNumerator', {
      value: numerator,
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(stats, '__percentNotFoundDenominator', {
      value: denominator,
      enumerable: false,
      configurable: true,
      writable: true
    });
    return stats;
  };

  const withWalkQuantityMeta = (stats, preSubNumerator, postSubNumerator, denominator) => {
    Object.defineProperty(stats, '__preSubNumerator', {
      value: preSubNumerator,
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(stats, '__postSubNumerator', {
      value: postSubNumerator,
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(stats, '__walkItemsDenominator', {
      value: denominator,
      enumerable: false,
      configurable: true,
      writable: true
    });
    return stats;
  };

  test('weights store averages by items picked for the timeframe', () => {
    const stats = aggregateStoreStats([
      {
        today: withWalkQuantityMeta(withPercentNotFoundMeta(withFtprMeta({
          ...EMPTY_STATS,
          itemsPicked: 40,
          pickRate: 120,
          firstTimePickPercent: 90,
          preSubstitutionPercent: 80,
          postSubstitutionPercent: 95,
          percentNotFound: 5,
          onTimePercent: 98,
          weightedEfficiency: 88,
          totesStaged: 2,
          ordersDispensed: 1
        }, 36, 40), 2, 40), 32, 38, 40)
      },
      {
        today: withWalkQuantityMeta(withPercentNotFoundMeta(withFtprMeta({
          ...EMPTY_STATS,
          itemsPicked: 10,
          pickRate: 60,
          firstTimePickPercent: 50,
          preSubstitutionPercent: 40,
          postSubstitutionPercent: 55,
          percentNotFound: 20,
          onTimePercent: 70,
          weightedEfficiency: 45,
          totesStaged: 1,
          ordersDispensed: 3
        }, 5, 10), 2, 10), 4, 5, 10)
      }
    ], 'today');

    expect(stats).toEqual({
      ...EMPTY_STATS,
      pickRate: 108,
      itemsPicked: 50,
      firstTimePickPercent: 82,
      preSubstitutionPercent: 72,
      postSubstitutionPercent: 86,
      percentNotFound: 8,
      onTimePercent: 92.4,
      weightedEfficiency: 79.4,
      totesStaged: 3,
      ordersDispensed: 4,
      totesDispensed: 0,
      itemsDispensed: 0,
      itemsStaged: 0
    });
  });

  test('ignores zero-item employees when averaging store metrics', () => {
    const stats = aggregateStoreStats([
      {
        today: {
          ...EMPTY_STATS,
          itemsPicked: 0,
          pickRate: 0,
          firstTimePickPercent: 0,
          weightedEfficiency: 0
        }
      },
      {
        today: withFtprMeta({
          ...EMPTY_STATS,
          itemsPicked: 25,
          pickRate: 75,
          firstTimePickPercent: 92,
          weightedEfficiency: 81
        }, 23, 25)
      }
    ], 'today');

    expect(stats.pickRate).toBe(75);
    expect(stats.firstTimePickPercent).toBe(92);
    expect(stats.weightedEfficiency).toBe(81);
    expect(stats.itemsPicked).toBe(25);
  });

  test('buildAllTimeFromDayStats calculates percent not found from total quantities instead of averaging daily percentages', () => {
    const allTime = buildAllTimeFromDayStats({
      '2026-04-18': withWalkQuantityMeta(withPercentNotFoundMeta(withFtprMeta({
        ...EMPTY_STATS,
        itemsPicked: 4,
        firstTimePickPercent: 90,
        preSubstitutionPercent: 80,
        percentNotFound: 50,
        weightedEfficiency: 40
      }, 1, 4), 1, 2), 4, 4, 5),
      '2026-04-19': withWalkQuantityMeta(withPercentNotFoundMeta(withFtprMeta({
        ...EMPTY_STATS,
        itemsPicked: 8,
        firstTimePickPercent: 70,
        preSubstitutionPercent: 60,
        percentNotFound: 0,
        weightedEfficiency: 65
      }, 8, 8), 0, 8), 3, 5, 5)
    });

    expect(allTime.percentNotFound).toBe(10);
    expect(allTime.firstTimePickPercent).toBe(75);
    expect(allTime.preSubstitutionPercent).toBe(70);
    expect(allTime.postSubstitutionPercent).toBe(90);
  });

  test('aggregateStoreStats calculates percent not found from raw quantities instead of items-picked weighting', () => {
    const stats = aggregateStoreStats([
      {
        allTime: withWalkQuantityMeta(withPercentNotFoundMeta(withFtprMeta({
          ...EMPTY_STATS,
          itemsPicked: 40,
          firstTimePickPercent: 90,
          preSubstitutionPercent: 80,
          percentNotFound: 20
        }, 90, 100), 20, 100), 80, 90, 100)
      },
      {
        allTime: withWalkQuantityMeta(withPercentNotFoundMeta(withFtprMeta({
          ...EMPTY_STATS,
          itemsPicked: 10,
          firstTimePickPercent: 50,
          preSubstitutionPercent: 40,
          percentNotFound: 0
        }, 0, 10), 0, 10), 4, 4, 10)
      }
    ], 'allTime');

    expect(stats.percentNotFound).toBe(18.18);
    expect(stats.firstTimePickPercent).toBe(81.82);
    expect(stats.preSubstitutionPercent).toBe(76.36);
    expect(stats.postSubstitutionPercent).toBe(85.45);
  });

  test('getEmployeeTimeframeStats derives pre-sub, post-sub, and percent-not-found from walk quantities', async () => {
    getWalkSummariesForEmployee.mockReturnValue([
      {
        startedAt: '2026-04-19T08:00:00.000Z',
        totalQuantity: 4,
        pickedQuantity: 3,
        originalPickedQuantity: 3,
        substitutedQuantity: 0,
        ftprMistakeQuantity: 1,
        mistakeQuantity: 1,
        firstTimePickRate: 75
      }
    ]);
    getCompletedPickWalkHistory.mockResolvedValue([]);
    Order.findAll.mockResolvedValue([]);

    const stats = await getEmployeeTimeframeStats(9);

    expect(stats.today.preSubstitutionPercent).toBe(75);
    expect(stats.today.postSubstitutionPercent).toBe(75);
    expect(stats.today.percentNotFound).toBe(25);
  });

  test('getEmployeeTimeframeStats sets day percent-not-found to 100 minus pre-substitution percent', async () => {
    getWalkSummariesForEmployee.mockReturnValue([
      {
        startedAt: '2026-04-19T08:00:00.000Z',
        totalQuantity: 4,
        pickedQuantity: 4,
        originalPickedQuantity: 2,
        substitutedQuantity: 2,
        ftprMistakeQuantity: 0,
        mistakeQuantity: 0,
        firstTimePickRate: 100
      }
    ]);
    getCompletedPickWalkHistory.mockResolvedValue([]);
    Order.findAll.mockResolvedValue([]);

    const stats = await getEmployeeTimeframeStats(9);

    expect(stats.today.preSubstitutionPercent).toBe(50);
    expect(stats.today.percentNotFound).toBe(50);
  });
});