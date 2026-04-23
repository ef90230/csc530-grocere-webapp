const fs = require('fs');
const path = require('path');
const { DEFAULT_TIME_ZONE, getTimeZoneDayKey, normalizeTimeZone } = require('./timeZone');
const { getRuntimeDataFilePath } = require('./runtimeDataPath');

const STORE_PATH = getRuntimeDataFilePath('employee-staged-items-history.json');

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
      return { employees: {} };
    }

    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { employees: {} };
    }

    const employees = parsed.employees && typeof parsed.employees === 'object' && !Array.isArray(parsed.employees)
      ? parsed.employees
      : {};

    return { employees };
  } catch {
    return { employees: {} };
  }
};

const writeStore = (store) => {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
};

const clampCount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.round(numeric));
};

const getEmployeeDayTotals = (employeeId) => {
  const id = String(employeeId || '');
  if (!id) {
    return {};
  }

  const store = readStore();
  const employeePayload = store.employees[id];
  const rawDays = employeePayload && typeof employeePayload === 'object' && employeePayload.days && typeof employeePayload.days === 'object'
    ? employeePayload.days
    : {};

  return Object.entries(rawDays).reduce((accumulator, [dayKey, dayTotal]) => {
    const normalizedDayKey = normalizeDayKey(dayKey);
    if (!normalizedDayKey) {
      return accumulator;
    }

    accumulator[normalizedDayKey] = clampCount(dayTotal);
    return accumulator;
  }, {});
};

const applyItemsStagedDelta = (employeeId, delta, dateInput = new Date(), timeZone = DEFAULT_TIME_ZONE) => {
  const id = String(employeeId || '');
  if (!id) {
    return;
  }

  const normalizedDelta = Math.round(Number(delta));
  if (!Number.isInteger(normalizedDelta) || normalizedDelta === 0) {
    return;
  }

  const dayKey = getLocalDayKey(dateInput, timeZone);
  if (!dayKey) {
    return;
  }

  const store = readStore();
  if (!store.employees[id]) {
    store.employees[id] = { days: {} };
  }

  if (!store.employees[id].days || typeof store.employees[id].days !== 'object') {
    store.employees[id].days = {};
  }

  const currentValue = clampCount(store.employees[id].days[dayKey]);
  const nextValue = Math.max(0, currentValue + normalizedDelta);
  store.employees[id].days[dayKey] = nextValue;

  writeStore(store);
};

module.exports = {
  applyItemsStagedDelta,
  getEmployeeDayTotals,
  getLocalDayKey
};
