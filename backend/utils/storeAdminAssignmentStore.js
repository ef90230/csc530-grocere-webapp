const fs = require('fs');
const { getRuntimeDataFilePath } = require('./runtimeDataPath');

const STORE_PATH = getRuntimeDataFilePath('store-admin-assignments.json');

const ensureFile = () => {
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({}, null, 2), 'utf8');
  }
};

const readAssignments = () => {
  ensureFile();

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Failed to read store admin assignments:', error);
    return {};
  }
};

const writeAssignments = (nextAssignments) => {
  ensureFile();

  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(nextAssignments, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to write store admin assignments:', error);
  }
};

const normalizeStoreKey = (storeId) => String(Number(storeId) || 0);

const getStoreAdminEmployeeId = (storeId) => {
  const key = normalizeStoreKey(storeId);
  const assignments = readAssignments();
  const employeeId = Number(assignments[key]);
  return Number.isInteger(employeeId) && employeeId > 0 ? employeeId : null;
};

const assignStoreAdmin = (storeId, employeeId) => {
  const key = normalizeStoreKey(storeId);
  const assignments = readAssignments();
  assignments[key] = Number(employeeId);
  writeAssignments(assignments);
};

const clearStoreAdmin = (storeId) => {
  const key = normalizeStoreKey(storeId);
  const assignments = readAssignments();
  if (Object.prototype.hasOwnProperty.call(assignments, key)) {
    delete assignments[key];
    writeAssignments(assignments);
  }
};

const isStoreAdminEmployee = (storeId, employeeId) => {
  const assignedEmployeeId = getStoreAdminEmployeeId(storeId);
  return assignedEmployeeId !== null && Number(assignedEmployeeId) === Number(employeeId);
};

module.exports = {
  getStoreAdminEmployeeId,
  assignStoreAdmin,
  clearStoreAdmin,
  isStoreAdminEmployee
};
