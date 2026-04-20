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

const { aggregateStoreStats, EMPTY_STATS } = require('../../utils/employeeTimeframeStatsService');

describe('employeeTimeframeStatsService.aggregateStoreStats', () => {
  test('weights store averages by items picked for the timeframe', () => {
    const stats = aggregateStoreStats([
      {
        today: {
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
        }
      },
      {
        today: {
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
        }
      }
    ], 'today');

    expect(stats).toEqual({
      ...EMPTY_STATS,
      pickRate: 108,
      itemsPicked: 50,
      firstTimePickPercent: 82,
      preSubstitutionPercent: 72,
      postSubstitutionPercent: 87,
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
        today: {
          ...EMPTY_STATS,
          itemsPicked: 25,
          pickRate: 75,
          firstTimePickPercent: 92,
          weightedEfficiency: 81
        }
      }
    ], 'today');

    expect(stats.pickRate).toBe(75);
    expect(stats.firstTimePickPercent).toBe(92);
    expect(stats.weightedEfficiency).toBe(81);
    expect(stats.itemsPicked).toBe(25);
  });
});