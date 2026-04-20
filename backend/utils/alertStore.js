const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'database', 'alerts.json');

const DEFAULT_STORE = {
  alerts: []
};

const ALERT_TYPES = new Set([
  'item_report',
  'map_report',
  'out_of_stock',
  'picker_alert',
  'employee_comment',
  'order_canceled',
  'picks_overdue'
]);

const readStore = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { ...DEFAULT_STORE };
    }

    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_STORE };
    }

    const alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
    return { alerts };
  } catch {
    return { ...DEFAULT_STORE };
  }
};

const writeStore = (store) => {
  const dirPath = path.dirname(STORE_PATH);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
};

const normalizeAlertType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ALERT_TYPES.has(normalized) ? normalized : 'employee_comment';
};

const normalizeString = (value, fallback = '') => {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
};

const toIntegerOrNull = (value) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
};

const buildAlertRecord = (input = {}) => {
  const nowIso = new Date().toISOString();
  const type = normalizeAlertType(input.type);

  return {
    id: normalizeString(input.id, `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    type,
    subtype: normalizeString(input.subtype),
    title: normalizeString(input.title, 'Alert'),
    subject: normalizeString(input.subject),
    message: normalizeString(input.message),
    actionLabel: normalizeString(input.actionLabel),
    actionTarget: input.actionTarget && typeof input.actionTarget === 'object'
      ? input.actionTarget
      : null,
    icon: normalizeString(input.icon),
    severity: normalizeString(input.severity),
    storeId: toIntegerOrNull(input.storeId),
    itemId: toIntegerOrNull(input.itemId),
    orderId: toIntegerOrNull(input.orderId),
    employeeId: toIntegerOrNull(input.employeeId),
    employeeName: normalizeString(input.employeeName),
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata
      : {},
    sourceKey: normalizeString(input.sourceKey),
    createdAt: normalizeString(input.createdAt, nowIso),
    updatedAt: normalizeString(input.updatedAt, nowIso)
  };
};

const listAlerts = (storeId = null) => {
  const normalizedStoreId = toIntegerOrNull(storeId);
  const store = readStore();

  return store.alerts
    .map((alert) => buildAlertRecord(alert))
    .filter((alert) => (normalizedStoreId ? alert.storeId === normalizedStoreId : true))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
};

const createAlert = (input = {}) => {
  const store = readStore();
  const nextAlert = buildAlertRecord(input);
  store.alerts.unshift(nextAlert);
  writeStore(store);
  return nextAlert;
};

const upsertAlertBySourceKey = (input = {}) => {
  const sourceKey = normalizeString(input.sourceKey);
  if (!sourceKey) {
    return createAlert(input);
  }

  const store = readStore();
  const existingIndex = store.alerts.findIndex((alert) => normalizeString(alert?.sourceKey) === sourceKey);
  const nextAlert = buildAlertRecord({
    ...input,
    id: existingIndex >= 0 ? store.alerts[existingIndex].id : undefined,
    createdAt: existingIndex >= 0 ? store.alerts[existingIndex].createdAt : undefined,
    updatedAt: new Date().toISOString()
  });

  if (existingIndex >= 0) {
    store.alerts[existingIndex] = nextAlert;
  } else {
    store.alerts.unshift(nextAlert);
  }

  writeStore(store);
  return nextAlert;
};

const dismissAlert = (alertId) => {
  const normalizedAlertId = normalizeString(alertId);
  if (!normalizedAlertId) {
    return false;
  }

  const store = readStore();
  const initialLength = store.alerts.length;
  store.alerts = store.alerts.filter((alert) => normalizeString(alert?.id) !== normalizedAlertId);

  if (store.alerts.length === initialLength) {
    return false;
  }

  writeStore(store);
  return true;
};

module.exports = {
  createAlert,
  dismissAlert,
  listAlerts,
  upsertAlertBySourceKey
};