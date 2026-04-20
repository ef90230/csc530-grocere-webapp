const fs = require('fs');
const path = require('path');
const { DEFAULT_TIME_ZONE, getTimeZoneDayKey, normalizeTimeZone } = require('./timeZone');

const STORE_PATH = path.join(__dirname, '..', 'database', 'store-wait-time-history.json');

const normalizeDayKey = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
};

const getLocalDayKey = (dateInput = new Date(), timeZone = DEFAULT_TIME_ZONE) => getTimeZoneDayKey(dateInput, normalizeTimeZone(timeZone));

const readStore = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { stores: {} };
    }

    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { stores: {} };
    }

    const stores = parsed.stores && typeof parsed.stores === 'object' && !Array.isArray(parsed.stores)
      ? parsed.stores
      : {};

    return { stores };
  } catch {
    return { stores: {} };
  }
};

const writeStore = (store) => {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
};

const clampMinutes = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return numeric;
};

const getStoreDayTotals = (storeId) => {
  const id = String(storeId || '');
  if (!id) {
    return {};
  }

  const store = readStore();
  const storePayload = store.stores[id];
  const rawDays = storePayload && typeof storePayload === 'object' && storePayload.days && typeof storePayload.days === 'object'
    ? storePayload.days
    : {};

  return Object.entries(rawDays).reduce((accumulator, [dayKey, dayData]) => {
    const normalizedDayKey = normalizeDayKey(dayKey);
    if (!normalizedDayKey) {
      return accumulator;
    }

    const totalMinutes = clampMinutes(dayData?.totalMinutes);
    const orderCount = Math.max(0, Math.round(Number(dayData?.orderCount) || 0));

    accumulator[normalizedDayKey] = { totalMinutes, orderCount };
    return accumulator;
  }, {});
};

const recordOrderWaitTime = (storeId, waitMinutes, dateInput = new Date(), timeZone = DEFAULT_TIME_ZONE) => {
  const id = String(storeId || '');
  if (!id) {
    return;
  }

  const normalizedMinutes = clampMinutes(waitMinutes);
  if (normalizedMinutes <= 0) {
    return;
  }

  const dayKey = getLocalDayKey(dateInput, timeZone);
  if (!dayKey) {
    return;
  }

  const store = readStore();
  if (!store.stores[id]) {
    store.stores[id] = { days: {} };
  }

  if (!store.stores[id].days[dayKey]) {
    store.stores[id].days[dayKey] = { totalMinutes: 0, orderCount: 0 };
  }

  store.stores[id].days[dayKey].totalMinutes = clampMinutes(
    store.stores[id].days[dayKey].totalMinutes + normalizedMinutes
  );
  store.stores[id].days[dayKey].orderCount = Math.max(
    0,
    Math.round((store.stores[id].days[dayKey].orderCount || 0) + 1)
  );

  writeStore(store);
};

module.exports = {
  getLocalDayKey,
  getStoreDayTotals,
  recordOrderWaitTime
};
