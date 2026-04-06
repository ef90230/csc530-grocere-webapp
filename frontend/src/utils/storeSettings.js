export const STORE_SETTINGS_CACHE_KEY = 'grocereStoreSettingsCache';

export const DEFAULT_STORE_SETTINGS = {
  goals: {
    pickRateGoal: {
      enabled: true,
      value: 100
    },
    firstTimePickRateGoal: {
      enabled: true,
      value: 92
    },
    preSubstitutionGoal: {
      enabled: true,
      value: 95
    },
    postSubstitutionGoal: {
      enabled: true,
      value: 99
    },
    onTimePickPercentGoal: {
      enabled: true,
      value: 100
    }
  },
  timeslot: {
    defaultLimit: 20,
    overrides: {}
  }
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const isUnsafeObjectKey = (key) => key === '__proto__' || key === 'prototype' || key === 'constructor';

const normalizeOverrides = (inputOverrides) => {
  if (!inputOverrides || typeof inputOverrides !== 'object' || Array.isArray(inputOverrides)) {
    return {};
  }

  const safeOverrides = {};
  Object.entries(inputOverrides).forEach(([slotKey, slotValue]) => {
    if (isUnsafeObjectKey(slotKey)) {
      return;
    }

    const parsed = Math.round(toNumber(slotValue, NaN));
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
      return;
    }

    safeOverrides[String(slotKey)] = parsed;
  });

  return safeOverrides;
};

const normalizeGoal = (inputGoal, defaultGoal, options = {}) => {
  const min = Number.isFinite(options.min) ? options.min : 0;
  const max = Number.isFinite(options.max) ? options.max : Number.MAX_SAFE_INTEGER;
  const integer = Boolean(options.integer);
  const normalizedRawValue = Math.min(max, Math.max(min, toNumber(inputGoal?.value, defaultGoal.value)));

  return {
    enabled: inputGoal?.enabled !== undefined ? Boolean(inputGoal.enabled) : Boolean(defaultGoal.enabled),
    value: integer ? Math.round(normalizedRawValue) : normalizedRawValue
  };
};

export const normalizeStoreSettings = (inputSettings) => {
  const source = inputSettings && typeof inputSettings === 'object' ? inputSettings : {};
  const goals = source.goals && typeof source.goals === 'object' ? source.goals : {};
  const timeslot = source.timeslot && typeof source.timeslot === 'object' ? source.timeslot : {};

  const hasGoal = (goalKey) => hasOwn(goals, goalKey) && goals[goalKey] && typeof goals[goalKey] === 'object';

  return {
    goals: {
      pickRateGoal: normalizeGoal(hasGoal('pickRateGoal') ? goals.pickRateGoal : undefined, DEFAULT_STORE_SETTINGS.goals.pickRateGoal, { min: 0.01 }),
      firstTimePickRateGoal: normalizeGoal(hasGoal('firstTimePickRateGoal') ? goals.firstTimePickRateGoal : undefined, DEFAULT_STORE_SETTINGS.goals.firstTimePickRateGoal, { min: 0, max: 100, integer: true }),
      preSubstitutionGoal: normalizeGoal(hasGoal('preSubstitutionGoal') ? goals.preSubstitutionGoal : undefined, DEFAULT_STORE_SETTINGS.goals.preSubstitutionGoal, { min: 0, max: 100, integer: true }),
      postSubstitutionGoal: normalizeGoal(hasGoal('postSubstitutionGoal') ? goals.postSubstitutionGoal : undefined, DEFAULT_STORE_SETTINGS.goals.postSubstitutionGoal, { min: 0, max: 100, integer: true }),
      onTimePickPercentGoal: normalizeGoal(hasGoal('onTimePickPercentGoal') ? goals.onTimePickPercentGoal : undefined, DEFAULT_STORE_SETTINGS.goals.onTimePickPercentGoal, { min: 0, max: 100, integer: true })
    },
    timeslot: {
      defaultLimit: Math.round(Math.max(1, toNumber(timeslot.defaultLimit, DEFAULT_STORE_SETTINGS.timeslot.defaultLimit))),
      overrides: normalizeOverrides(timeslot.overrides)
    }
  };
};

export const saveStoreSettingsToCache = (settings) => {
  try {
    const normalized = normalizeStoreSettings(settings);
    window.localStorage.setItem(STORE_SETTINGS_CACHE_KEY, JSON.stringify(normalized));
  } catch {
  }
};

export const readStoreSettingsFromCache = () => {
  try {
    const raw = window.localStorage.getItem(STORE_SETTINGS_CACHE_KEY);
    if (!raw) {
      return normalizeStoreSettings(DEFAULT_STORE_SETTINGS);
    }

    return normalizeStoreSettings(JSON.parse(raw));
  } catch {
    return normalizeStoreSettings(DEFAULT_STORE_SETTINGS);
  }
};

export const getMetricGoalSetting = (settings, goalKey) => {
  const normalized = normalizeStoreSettings(settings);
  return normalized.goals[goalKey] || { enabled: true, value: 0 };
};
