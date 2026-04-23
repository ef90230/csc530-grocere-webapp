const WALK_TIME_LIMIT_STORAGE_KEY = 'activeWalkTimeLimit';
const WALK_TIMEOUT_DIALOG_PENDING_KEY = 'walkTimeoutDialogPending';
const FORTY_FIVE_MINUTES_MS = 45 * 60 * 1000;

const normalizeCommodity = (commodity) => String(commodity || '').trim().toLowerCase();

export const isTimeLimitedCommodity = (commodity) => {
  const normalized = normalizeCommodity(commodity);
  return normalized === 'chilled' || normalized === 'frozen';
};

const parseDateOrNow = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return Date.now();
  }

  return parsed.getTime();
};

export const readActiveWalkTimeLimit = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WALK_TIME_LIMIT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const commodity = normalizeCommodity(parsed?.commodity);
    const deadlineAt = Number(parsed?.deadlineAt);

    if (!commodity || !Number.isFinite(deadlineAt)) {
      return null;
    }

    return {
      commodity,
      commodityLabel: String(parsed?.commodityLabel || '').trim(),
      storeId: Number(parsed?.storeId) || null,
      walkStartedAt: parsed?.walkStartedAt || null,
      deadlineAt
    };
  } catch {
    return null;
  }
};

export const setActiveWalkTimeLimit = ({ commodity, commodityLabel, storeId, walkStartedAt }) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const normalizedCommodity = normalizeCommodity(commodity);
  if (!isTimeLimitedCommodity(normalizedCommodity)) {
    window.localStorage.removeItem(WALK_TIME_LIMIT_STORAGE_KEY);
    return null;
  }

  const startedAtMs = parseDateOrNow(walkStartedAt);
  const payload = {
    commodity: normalizedCommodity,
    commodityLabel: String(commodityLabel || '').trim(),
    storeId: Number(storeId) || null,
    walkStartedAt: new Date(startedAtMs).toISOString(),
    deadlineAt: startedAtMs + FORTY_FIVE_MINUTES_MS
  };

  window.localStorage.setItem(WALK_TIME_LIMIT_STORAGE_KEY, JSON.stringify(payload));
  return payload;
};

export const clearActiveWalkTimeLimit = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(WALK_TIME_LIMIT_STORAGE_KEY);
};

export const getRemainingWalkTimeMs = (nowMs = Date.now()) => {
  const activeWalk = readActiveWalkTimeLimit();
  if (!activeWalk) {
    return null;
  }

  return Math.max(0, activeWalk.deadlineAt - Number(nowMs || Date.now()));
};

export const isWalkTimeExpired = (nowMs = Date.now()) => {
  const remainingMs = getRemainingWalkTimeMs(nowMs);
  if (remainingMs === null) {
    return false;
  }

  return remainingMs <= 0;
};

export const readWalkTimeoutDialogPending = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(WALK_TIMEOUT_DIALOG_PENDING_KEY) === '1';
};

export const markWalkTimeoutDialogPending = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(WALK_TIMEOUT_DIALOG_PENDING_KEY, '1');
};

export const clearWalkTimeoutDialogPending = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(WALK_TIMEOUT_DIALOG_PENDING_KEY);
};
