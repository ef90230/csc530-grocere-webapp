const STORE_SETTINGS_KEY = '__storeSettings';

const DEFAULT_GOALS = {
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
};

const DEFAULT_TIMESLOT_ORDER_LIMIT = 20;
const DEFAULT_WAIT_TIME_WARNING_MINUTES = 5;
const MAX_STORE_PHONE_LENGTH = 32;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isUnsafeObjectKey = (key) => key === '__proto__' || key === 'prototype' || key === 'constructor';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, minValue, maxValue) => Math.min(maxValue, Math.max(minValue, value));

const normalizeStorePhone = (value, fallback = '') => {
  const source = value === undefined || value === null || value === '' ? fallback : value;
  if (typeof source !== 'string' && typeof source !== 'number') {
    return '';
  }

  const cleaned = String(source)
    .replace(/[^0-9+()\-\s.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, MAX_STORE_PHONE_LENGTH);
};

const normalizeToggleGoal = (inputGoal, defaultGoal, bounds = {}) => {
  const minValue = Number.isFinite(bounds.min) ? bounds.min : 0;
  const maxValue = Number.isFinite(bounds.max) ? bounds.max : Number.MAX_SAFE_INTEGER;
  const isInteger = Boolean(bounds.integer);
  const rawValue = toNumber(inputGoal?.value, defaultGoal.value);
  const boundedValue = clamp(rawValue, minValue, maxValue);
  const normalizedValue = isInteger ? Math.round(boundedValue) : boundedValue;

  return {
    enabled: inputGoal?.enabled !== undefined ? Boolean(inputGoal.enabled) : Boolean(defaultGoal.enabled),
    value: normalizedValue
  };
};

const normalizeOverrides = (inputOverrides) => {
  if (!inputOverrides || typeof inputOverrides !== 'object' || Array.isArray(inputOverrides)) {
    return {};
  }

  return Object.entries(inputOverrides).reduce((accumulator, [slotKey, slotLimit]) => {
    if (isUnsafeObjectKey(slotKey)) {
      return accumulator;
    }

    const parsedLimit = Math.round(toNumber(slotLimit, NaN));
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      return accumulator;
    }

    accumulator[String(slotKey)] = parsedLimit;
    return accumulator;
  }, {});
};

const normalizeStoreSettings = (inputSettings, options = {}) => {
  const source = inputSettings && typeof inputSettings === 'object' && !Array.isArray(inputSettings)
    ? inputSettings
    : {};
  const fallbackStorePhone = options && typeof options === 'object' ? options.fallbackStorePhone : '';

  const goals = source.goals && typeof source.goals === 'object' ? source.goals : {};
  const timeslot = source.timeslot && typeof source.timeslot === 'object' ? source.timeslot : {};
  const hasGoal = (goalKey) => hasOwn(goals, goalKey) && goals[goalKey] && typeof goals[goalKey] === 'object';

  const defaultLimit = Math.round(clamp(toNumber(timeslot.defaultLimit, DEFAULT_TIMESLOT_ORDER_LIMIT), 1, 500));
  const waitTimeWarningMinutes = Math.max(1, Math.round(clamp(toNumber(source.waitTimeWarningMinutes, DEFAULT_WAIT_TIME_WARNING_MINUTES), 1, 1440)));

  return {
    goals: {
      pickRateGoal: normalizeToggleGoal(hasGoal('pickRateGoal') ? goals.pickRateGoal : undefined, DEFAULT_GOALS.pickRateGoal, { min: 0.01 }),
      firstTimePickRateGoal: normalizeToggleGoal(hasGoal('firstTimePickRateGoal') ? goals.firstTimePickRateGoal : undefined, DEFAULT_GOALS.firstTimePickRateGoal, { min: 0, max: 100, integer: true }),
      preSubstitutionGoal: normalizeToggleGoal(hasGoal('preSubstitutionGoal') ? goals.preSubstitutionGoal : undefined, DEFAULT_GOALS.preSubstitutionGoal, { min: 0, max: 100, integer: true }),
      postSubstitutionGoal: normalizeToggleGoal(hasGoal('postSubstitutionGoal') ? goals.postSubstitutionGoal : undefined, DEFAULT_GOALS.postSubstitutionGoal, { min: 0, max: 100, integer: true }),
      onTimePickPercentGoal: normalizeToggleGoal(hasGoal('onTimePickPercentGoal') ? goals.onTimePickPercentGoal : undefined, DEFAULT_GOALS.onTimePickPercentGoal, { min: 0, max: 100, integer: true })
    },
    timeslot: {
      defaultLimit,
      overrides: normalizeOverrides(timeslot.overrides)
    },
    waitTimeWarningMinutes,
    storePhone: normalizeStorePhone(source.storePhone, fallbackStorePhone)
  };
};

const getStoreSettingsFromStore = (store, options = {}) => {
  const rawPayload = store?.backroomDoorLocation;
  const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    ? rawPayload
    : {};

  return normalizeStoreSettings(payload[STORE_SETTINGS_KEY], {
    fallbackStorePhone: options?.fallbackStorePhone || store?.phone || ''
  });
};

const resolveStorePhoneFromStore = (store) => {
  const settings = getStoreSettingsFromStore(store, {
    fallbackStorePhone: store?.phone || ''
  });

  return normalizeStorePhone(settings.storePhone, store?.phone || '');
};

const buildBackroomDoorLocationWithStoreSettings = (existingBackroomDoorLocation, nextStoreSettings) => {
  const basePayload = {};
  if (existingBackroomDoorLocation && typeof existingBackroomDoorLocation === 'object' && !Array.isArray(existingBackroomDoorLocation)) {
    Object.entries(existingBackroomDoorLocation).forEach(([key, value]) => {
      if (isUnsafeObjectKey(key)) {
        return;
      }

      basePayload[key] = value;
    });
  }

  return {
    ...basePayload,
    [STORE_SETTINGS_KEY]: normalizeStoreSettings(nextStoreSettings)
  };
};

const getTimeslotKeyFromDate = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
};

const getTimeslotCapacityForDate = (storeSettings, dateValue) => {
  const settings = normalizeStoreSettings(storeSettings);
  const slotKey = getTimeslotKeyFromDate(dateValue);
  if (!slotKey) {
    return settings.timeslot.defaultLimit;
  }

  return settings.timeslot.overrides[slotKey] || settings.timeslot.defaultLimit;
};

module.exports = {
  DEFAULT_GOALS,
  DEFAULT_TIMESLOT_ORDER_LIMIT,
  DEFAULT_WAIT_TIME_WARNING_MINUTES,
  STORE_SETTINGS_KEY,
  normalizeStoreSettings,
  normalizeStorePhone,
  getStoreSettingsFromStore,
  resolveStorePhoneFromStore,
  buildBackroomDoorLocationWithStoreSettings,
  getTimeslotKeyFromDate,
  getTimeslotCapacityForDate
};
