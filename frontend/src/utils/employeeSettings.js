export const EMPLOYEE_SETTINGS_STORAGE_PREFIX = 'grocereEmployeeSettings';

export const DEFAULT_EMPLOYEE_SETTINGS = {
  displayLivePickRateForDay: true,
  displayLivePickRateForEachWalk: true
};

const isSafeBoolean = (value, fallback = true) => {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
};

export const normalizeEmployeeSettings = (inputSettings) => {
  const source = inputSettings && typeof inputSettings === 'object' ? inputSettings : {};

  return {
    displayLivePickRateForDay: isSafeBoolean(
      source.displayLivePickRateForDay,
      DEFAULT_EMPLOYEE_SETTINGS.displayLivePickRateForDay
    ),
    displayLivePickRateForEachWalk: isSafeBoolean(
      source.displayLivePickRateForEachWalk,
      DEFAULT_EMPLOYEE_SETTINGS.displayLivePickRateForEachWalk
    )
  };
};

export const getStoredEmployeeId = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem('employeeUserId') || '';
};

const getEmployeeSettingsKey = (employeeId) => {
  const safeEmployeeId = String(employeeId || '').trim();
  if (!safeEmployeeId) {
    return '';
  }

  return `${EMPLOYEE_SETTINGS_STORAGE_PREFIX}:${safeEmployeeId}`;
};

export const saveEmployeeSettingsToCache = (employeeId, settings) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const storageKey = getEmployeeSettingsKey(employeeId);
    if (!storageKey) {
      return;
    }

    const normalized = normalizeEmployeeSettings(settings);
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  } catch {
  }
};

export const readEmployeeSettingsFromCache = (employeeId) => {
  if (typeof window === 'undefined') {
    return normalizeEmployeeSettings(DEFAULT_EMPLOYEE_SETTINGS);
  }

  try {
    const storageKey = getEmployeeSettingsKey(employeeId);
    if (!storageKey) {
      return normalizeEmployeeSettings(DEFAULT_EMPLOYEE_SETTINGS);
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return normalizeEmployeeSettings(DEFAULT_EMPLOYEE_SETTINGS);
    }

    return normalizeEmployeeSettings(JSON.parse(raw));
  } catch {
    return normalizeEmployeeSettings(DEFAULT_EMPLOYEE_SETTINGS);
  }
};
