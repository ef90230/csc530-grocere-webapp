const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'database', 'walk-performance-history.json');

const toInt = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const clampNonNegativeInt = (value) => Math.max(0, toInt(value, 0));

const toIso = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString();
};

const makeWalkKey = ({ employeeId, startedAt, commodity }) => {
  const normalizedEmployeeId = toInt(employeeId, 0);
  const normalizedStartedAt = toIso(startedAt);
  const normalizedCommodity = String(commodity || '').trim().toLowerCase();

  if (!normalizedEmployeeId || !normalizedStartedAt || !normalizedCommodity) {
    return '';
  }

  return `${normalizedEmployeeId}::${normalizedStartedAt}::${normalizedCommodity}`;
};

const normalizeQueueItems = (queueItems) => {
  if (!Array.isArray(queueItems)) {
    return {};
  }

  return queueItems.reduce((accumulator, row) => {
    const itemId = String(row?.orderItemId || '').trim();
    const qty = clampNonNegativeInt(row?.quantityToPick);

    if (!itemId || qty <= 0) {
      return accumulator;
    }

    accumulator[itemId] = Math.max(accumulator[itemId] || 0, qty);
    return accumulator;
  }, {});
};

const normalizeQueueOrderIds = (queueItems) => {
  if (!Array.isArray(queueItems)) {
    return [];
  }

  const uniqueOrderIds = new Set();

  queueItems.forEach((row) => {
    const orderId = toInt(row?.orderId, 0);
    if (orderId > 0) {
      uniqueOrderIds.add(orderId);
    }
  });

  return Array.from(uniqueOrderIds).sort((left, right) => left - right);
};

const safeObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
};

const safeOrderIdArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueOrderIds = new Set();
  value.forEach((orderId) => {
    const normalizedOrderId = toInt(orderId, 0);
    if (normalizedOrderId > 0) {
      uniqueOrderIds.add(normalizedOrderId);
    }
  });

  return Array.from(uniqueOrderIds).sort((left, right) => left - right);
};

const normalizeItemIdArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueItemIds = new Set();
  value.forEach((itemId) => {
    const normalizedItemId = String(itemId || '').trim();
    if (normalizedItemId) {
      uniqueItemIds.add(normalizedItemId);
    }
  });

  return Array.from(uniqueItemIds);
};

const normalizeOrderSymbolMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((accumulator, [orderId, symbol]) => {
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();

    if (!normalizedOrderId || !/^[A-H]$/.test(normalizedSymbol)) {
      return accumulator;
    }

    accumulator[normalizedOrderId] = normalizedSymbol;
    return accumulator;
  }, {});
};

const readStore = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { walks: {} };
    }

    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const walks = safeObject(parsed?.walks);
    return { walks };
  } catch {
    return { walks: {} };
  }
};

const writeStore = (store) => {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
};

const getItemTotal = (walk, orderItemId) => {
  const itemTotals = safeObject(walk?.itemTotals);
  const key = String(orderItemId || '').trim();
  return clampNonNegativeInt(itemTotals[key]);
};

const computeTotalQuantity = (itemTotals) => Object.values(safeObject(itemTotals))
  .reduce((sum, qty) => sum + clampNonNegativeInt(qty), 0);

const getTotalItemCount = (walk) => {
  const itemTotals = safeObject(walk?.itemTotals);
  return Object.keys(itemTotals).length;
};

const getMistakeItemCount = (walk) => {
  const itemMistakes = safeObject(walk?.itemMistakes);
  const itemMistakeFlags = safeObject(walk?.itemMistakeFlags);

  const flaggedItemIds = new Set();

  Object.keys(itemMistakes).forEach((itemId) => {
    const normalizedItemId = String(itemId || '').trim();
    if (normalizedItemId && clampNonNegativeInt(itemMistakes[itemId]) > 0) {
      flaggedItemIds.add(normalizedItemId);
    }
  });

  Object.entries(itemMistakeFlags).forEach(([itemId, flagged]) => {
    const normalizedItemId = String(itemId || '').trim();
    if (normalizedItemId && Boolean(flagged)) {
      flaggedItemIds.add(normalizedItemId);
    }
  });

  const totalItems = getTotalItemCount(walk);
  const unresolvedExtraMistakes = clampNonNegativeInt(walk?.extraMistakes);
  const remainingUnflagged = Math.max(0, totalItems - flaggedItemIds.size);
  const extraAsItems = Math.min(remainingUnflagged, unresolvedExtraMistakes > 0 ? Math.ceil(unresolvedExtraMistakes) : 0);

  return Math.min(totalItems, flaggedItemIds.size + extraAsItems);
};

const getMistakeTotal = (walk) => {
  const perItemMistakes = Object.values(safeObject(walk?.itemMistakes))
    .reduce((sum, qty) => sum + clampNonNegativeInt(qty), 0);
  const extraMistakes = clampNonNegativeInt(walk?.extraMistakes);
  const totalQuantity = clampNonNegativeInt(walk?.totalQuantity);

  return Math.min(totalQuantity, perItemMistakes + extraMistakes);
};

const getFtprMistakeItemIds = (walk) => {
  return Object.entries(safeObject(walk?.itemFtprMistakeFlags))
    .filter(([, flagged]) => Boolean(flagged))
    .map(([itemId]) => String(itemId || '').trim())
    .filter(Boolean);
};

const getFtprMistakeQuantity = (walk) => {
  const itemTotals = safeObject(walk?.itemTotals);

  return getFtprMistakeItemIds(walk)
    .reduce((sum, itemId) => sum + clampNonNegativeInt(itemTotals[itemId]), 0);
};

const getWalkFtpr = (walk) => {
  const totalQuantity = clampNonNegativeInt(walk?.totalQuantity);
  if (totalQuantity <= 0) {
    return 0;
  }

  const mistakeQuantity = getFtprMistakeQuantity(walk);
  const numerator = Math.max(0, totalQuantity - mistakeQuantity);
  return Number(((numerator / totalQuantity) * 100).toFixed(2));
};

const ensureTrackedItemQuantity = (walk, orderItemId, fallbackQuantity = 0) => {
  const itemId = String(orderItemId || '').trim();
  if (!itemId) {
    return { walk, itemId: '' };
  }

  if (getItemTotal(walk, itemId) > 0) {
    return { walk, itemId };
  }

  const normalizedFallbackQuantity = clampNonNegativeInt(fallbackQuantity);
  if (normalizedFallbackQuantity <= 0) {
    return { walk, itemId };
  }

  const nextItemTotals = {
    ...safeObject(walk.itemTotals),
    [itemId]: normalizedFallbackQuantity
  };

  walk.itemTotals = nextItemTotals;
  walk.totalQuantity = computeTotalQuantity(nextItemTotals);

  return { walk, itemId };
};

const ensureWalk = ({ employeeId, storeId, commodity, startedAt, queueItems = [], orderSymbolsByOrderId = {} }) => {
  const key = makeWalkKey({ employeeId, commodity, startedAt });
  if (!key) {
    return null;
  }

  const store = readStore();
  const existing = safeObject(store.walks[key]);

  const incomingItemTotals = normalizeQueueItems(queueItems);
  const incomingOrderIds = normalizeQueueOrderIds(queueItems);
  const nextItemTotals = { ...safeObject(existing.itemTotals) };
  const existingOrderIds = safeOrderIdArray(existing.orderIds);
  const nextOrderIds = safeOrderIdArray([...existingOrderIds, ...incomingOrderIds]);
  const nextOrderSymbolsByOrderId = {
    ...normalizeOrderSymbolMap(existing.orderSymbolsByOrderId),
    ...normalizeOrderSymbolMap(orderSymbolsByOrderId)
  };

  Object.entries(incomingItemTotals).forEach(([itemId, qty]) => {
    nextItemTotals[itemId] = Math.max(clampNonNegativeInt(nextItemTotals[itemId]), clampNonNegativeInt(qty));
  });

  const nextWalk = {
    key,
    employeeId: toInt(employeeId, 0),
    storeId: toInt(storeId, 0),
    commodity: String(commodity || '').trim().toLowerCase(),
    startedAt: toIso(startedAt),
    endedAt: existing.endedAt ? toIso(existing.endedAt) : null,
    closed: Boolean(existing.closed),
    orderIds: nextOrderIds,
    orderSymbolsByOrderId: nextOrderSymbolsByOrderId,
    itemTotals: nextItemTotals,
    itemMistakes: safeObject(existing.itemMistakes),
    itemMistakeFlags: safeObject(existing.itemMistakeFlags),
    itemFtprMistakeFlags: safeObject(existing.itemFtprMistakeFlags),
    itemFtprAttemptedFlags: safeObject(existing.itemFtprAttemptedFlags),
    extraMistakes: clampNonNegativeInt(existing.extraMistakes),
    pickedQuantity: clampNonNegativeInt(existing.pickedQuantity),
    originalPickedQuantity: clampNonNegativeInt(existing.originalPickedQuantity),
    substitutedQuantity: clampNonNegativeInt(existing.substitutedQuantity),
    totalQuantity: computeTotalQuantity(nextItemTotals)
  };

  store.walks[key] = nextWalk;
  writeStore(store);

  return nextWalk;
};

const recordPickQuantity = ({ employeeId, commodity, startedAt, orderItemId, quantity, pickKind = 'original' }) => {
  const key = makeWalkKey({ employeeId, commodity, startedAt });
  if (!key) {
    return;
  }

  const store = readStore();
  const walk = safeObject(store.walks[key]);
  if (!walk || !Object.keys(walk).length) {
    return;
  }

  const delta = clampNonNegativeInt(quantity);
  if (delta <= 0) {
    return;
  }

  const { itemId } = ensureTrackedItemQuantity(walk, orderItemId, delta);

  walk.pickedQuantity = Math.min(
    clampNonNegativeInt(walk.totalQuantity),
    clampNonNegativeInt(walk.pickedQuantity) + delta
  );

  if (itemId) {
    walk.itemFtprAttemptedFlags = {
      ...safeObject(walk.itemFtprAttemptedFlags),
      [itemId]: true
    };
  }

  if (String(pickKind || '').trim().toLowerCase() === 'substituted') {
    walk.substitutedQuantity = Math.min(
      clampNonNegativeInt(walk.totalQuantity),
      clampNonNegativeInt(walk.substitutedQuantity) + delta
    );
  } else {
    walk.originalPickedQuantity = Math.min(
      clampNonNegativeInt(walk.totalQuantity),
      clampNonNegativeInt(walk.originalPickedQuantity) + delta
    );
  }

  store.walks[key] = walk;
  writeStore(store);
};

const recordMistakeQuantity = ({ employeeId, commodity, startedAt, orderItemId, quantity }) => {
  const key = makeWalkKey({ employeeId, commodity, startedAt });
  if (!key) {
    return;
  }

  const store = readStore();
  const walk = safeObject(store.walks[key]);
  if (!walk || !Object.keys(walk).length) {
    return;
  }

  const delta = clampNonNegativeInt(quantity);
  if (delta <= 0) {
    return;
  }

  const itemId = String(orderItemId || '').trim();
  if (!itemId) {
    const current = clampNonNegativeInt(walk.extraMistakes);
    walk.extraMistakes = Math.min(
      clampNonNegativeInt(walk.totalQuantity),
      current + delta
    );
    store.walks[key] = walk;
    writeStore(store);
    return;
  }

  const itemTotals = safeObject(walk.itemTotals);
  const itemMistakes = safeObject(walk.itemMistakes);
  const itemMistakeFlags = safeObject(walk.itemMistakeFlags);
  let maxItemQty = clampNonNegativeInt(itemTotals[itemId]);

  if (maxItemQty <= 0) {
    maxItemQty = delta;
    walk.itemTotals = {
      ...itemTotals,
      [itemId]: maxItemQty
    };
    walk.totalQuantity = computeTotalQuantity(walk.itemTotals);
  }

  const nextItemMistake = Math.min(maxItemQty, clampNonNegativeInt(itemMistakes[itemId]) + delta);
  walk.itemMistakes = {
    ...itemMistakes,
    [itemId]: nextItemMistake
  };
  walk.itemMistakeFlags = {
    ...itemMistakeFlags,
    [itemId]: true
  };

  store.walks[key] = walk;
  writeStore(store);
};

const recordFtprMistake = ({ employeeId, commodity, startedAt, orderItemId, quantity }) => {
  const key = makeWalkKey({ employeeId, commodity, startedAt });
  if (!key) {
    return;
  }

  const store = readStore();
  const walk = safeObject(store.walks[key]);
  if (!walk || !Object.keys(walk).length) {
    return;
  }

  const delta = clampNonNegativeInt(quantity);
  if (delta <= 0) {
    return;
  }

  const { itemId } = ensureTrackedItemQuantity(walk, orderItemId, delta);
  if (!itemId) {
    return;
  }

  const attemptedFlags = safeObject(walk.itemFtprAttemptedFlags);
  if (Boolean(attemptedFlags[itemId])) {
    store.walks[key] = walk;
    writeStore(store);
    return;
  }

  walk.itemFtprAttemptedFlags = {
    ...attemptedFlags,
    [itemId]: true
  };
  walk.itemFtprMistakeFlags = {
    ...safeObject(walk.itemFtprMistakeFlags),
    [itemId]: true
  };

  store.walks[key] = walk;
  writeStore(store);
};

const closeWalk = ({ employeeId, commodity, startedAt, extraMistakeQuantity = 0, mistakeOrderItemIds = [] }) => {
  const key = makeWalkKey({ employeeId, commodity, startedAt });
  if (!key) {
    return null;
  }

  const store = readStore();
  const walk = safeObject(store.walks[key]);
  if (!walk || !Object.keys(walk).length) {
    return null;
  }

  const extraMistakes = clampNonNegativeInt(extraMistakeQuantity);
  if (extraMistakes > 0) {
    walk.extraMistakes = Math.min(
      clampNonNegativeInt(walk.totalQuantity),
      clampNonNegativeInt(walk.extraMistakes) + extraMistakes
    );
  }

  const normalizedMistakeItemIds = normalizeItemIdArray(mistakeOrderItemIds);
  if (normalizedMistakeItemIds.length > 0) {
    const itemMistakeFlags = safeObject(walk.itemMistakeFlags);
    normalizedMistakeItemIds.forEach((itemId) => {
      itemMistakeFlags[itemId] = true;
    });
    walk.itemMistakeFlags = itemMistakeFlags;
  }

  walk.closed = true;
  walk.endedAt = new Date().toISOString();

  store.walks[key] = walk;
  writeStore(store);

  return walk;
};

const closeLatestOpenWalk = ({ employeeId, commodity, extraMistakeQuantity = 0, mistakeOrderItemIds = [] }) => {
  const normalizedEmployeeId = toInt(employeeId, 0);
  const normalizedCommodity = String(commodity || '').trim().toLowerCase();
  if (!normalizedEmployeeId || !normalizedCommodity) {
    return null;
  }

  const store = readStore();
  const candidates = Object.values(safeObject(store.walks))
    .filter((walk) => (
      toInt(walk?.employeeId, 0) === normalizedEmployeeId
      && String(walk?.commodity || '').trim().toLowerCase() === normalizedCommodity
      && !walk?.closed
    ))
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());

  const target = candidates[0];
  if (!target) {
    return null;
  }

  const extraMistakes = clampNonNegativeInt(extraMistakeQuantity);
  if (extraMistakes > 0) {
    target.extraMistakes = Math.min(
      clampNonNegativeInt(target.totalQuantity),
      clampNonNegativeInt(target.extraMistakes) + extraMistakes
    );
  }

  const normalizedMistakeItemIds = normalizeItemIdArray(mistakeOrderItemIds);
  if (normalizedMistakeItemIds.length > 0) {
    const itemMistakeFlags = safeObject(target.itemMistakeFlags);
    normalizedMistakeItemIds.forEach((itemId) => {
      itemMistakeFlags[itemId] = true;
    });
    target.itemMistakeFlags = itemMistakeFlags;
  }

  target.closed = true;
  target.endedAt = new Date().toISOString();

  store.walks[target.key] = target;
  writeStore(store);

  return target;
};

const getOpenWalks = ({ employeeId, storeId, commodity } = {}) => {
  const normalizedEmployeeId = toInt(employeeId, 0);
  const normalizedStoreId = toInt(storeId, 0);
  const normalizedCommodity = String(commodity || '').trim().toLowerCase();
  if (!normalizedEmployeeId) {
    return [];
  }

  const store = readStore();
  return Object.values(safeObject(store.walks))
    .filter((walk) => {
      if (toInt(walk?.employeeId, 0) !== normalizedEmployeeId || walk?.closed) {
        return false;
      }

      if (normalizedStoreId && toInt(walk?.storeId, 0) !== normalizedStoreId) {
        return false;
      }

      if (normalizedCommodity && String(walk?.commodity || '').trim().toLowerCase() !== normalizedCommodity) {
        return false;
      }

      return true;
    })
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());
};

const getLatestOpenWalk = (options = {}) => {
  return getOpenWalks(options)[0] || null;
};

const getWalkFtprByKey = (key) => {
  const store = readStore();
  const walk = safeObject(store.walks[key]);
  if (!walk || !Object.keys(walk).length) {
    return 0;
  }

  return getWalkFtpr(walk);
};

const getWalkSummariesForEmployee = (employeeId, { dayKey, closedOnly = true } = {}) => {
  const normalizedEmployeeId = toInt(employeeId, 0);
  if (!normalizedEmployeeId) {
    return [];
  }

  const store = readStore();

  return Object.values(safeObject(store.walks))
    .filter((walk) => {
      if (toInt(walk?.employeeId, 0) !== normalizedEmployeeId) {
        return false;
      }

      if (closedOnly && !walk?.closed) {
        return false;
      }

      if (dayKey) {
        const started = new Date(walk?.startedAt);
        if (Number.isNaN(started.getTime())) {
          return false;
        }

        const walkDayKey = `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, '0')}-${String(started.getDate()).padStart(2, '0')}`;
        if (walkDayKey !== dayKey) {
          return false;
        }
      }

      return true;
    })
    .map((walk) => ({
      key: walk.key,
      commodity: walk.commodity,
      startedAt: walk.startedAt,
      endedAt: walk.endedAt,
      orderCount: safeOrderIdArray(walk.orderIds).length,
      totalItems: getTotalItemCount(walk),
      totalQuantity: clampNonNegativeInt(walk.totalQuantity),
      pickedQuantity: clampNonNegativeInt(walk.pickedQuantity),
      originalPickedQuantity: clampNonNegativeInt(walk.originalPickedQuantity),
      substitutedQuantity: clampNonNegativeInt(walk.substitutedQuantity),
      mistakeItems: getMistakeItemCount(walk),
      mistakeQuantity: getMistakeTotal(walk),
      ftprMistakeQuantity: getFtprMistakeQuantity(walk),
      firstTimePickRate: getWalkFtpr(walk)
    }))
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());
};

module.exports = {
  makeWalkKey,
  ensureWalk,
  recordPickQuantity,
  recordMistakeQuantity,
  recordFtprMistake,
  closeWalk,
  closeLatestOpenWalk,
  getOpenWalks,
  getLatestOpenWalk,
  getWalkFtprByKey,
  getWalkSummariesForEmployee
};
