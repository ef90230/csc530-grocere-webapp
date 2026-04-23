const fs = require('fs');
const { getRuntimeDataFilePath } = require('./runtimeDataPath');

const STORE_PATH = getRuntimeDataFilePath('item-store-assignments.json');

const ensureFile = () => {
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ itemToStore: {} }, null, 2), 'utf8');
  }
};

const readStore = () => {
  ensureFile();

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { itemToStore: {} };
    }

    const itemToStore = parsed.itemToStore && typeof parsed.itemToStore === 'object'
      ? parsed.itemToStore
      : {};

    return { itemToStore };
  } catch (error) {
    console.error('Failed to read item store assignments:', error);
    return { itemToStore: {} };
  }
};

const writeStore = (nextStore) => {
  ensureFile();

  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(nextStore, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to write item store assignments:', error);
  }
};

const toPositiveIntegerOrNull = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const assignItemToStore = (itemId, storeId) => {
  const normalizedItemId = toPositiveIntegerOrNull(itemId);
  const normalizedStoreId = toPositiveIntegerOrNull(storeId);
  if (!normalizedItemId || !normalizedStoreId) {
    return;
  }

  const store = readStore();
  store.itemToStore[String(normalizedItemId)] = normalizedStoreId;
  writeStore(store);
};

const getAssignedStoreIdForItem = (itemId) => {
  const normalizedItemId = toPositiveIntegerOrNull(itemId);
  if (!normalizedItemId) {
    return null;
  }

  const store = readStore();
  const assignedStoreId = toPositiveIntegerOrNull(store.itemToStore[String(normalizedItemId)]);
  return assignedStoreId || null;
};

const clearItemAssignment = (itemId) => {
  const normalizedItemId = toPositiveIntegerOrNull(itemId);
  if (!normalizedItemId) {
    return;
  }

  const store = readStore();
  const key = String(normalizedItemId);
  if (Object.prototype.hasOwnProperty.call(store.itemToStore, key)) {
    delete store.itemToStore[key];
    writeStore(store);
  }
};

module.exports = {
  assignItemToStore,
  getAssignedStoreIdForItem,
  clearItemAssignment
};
