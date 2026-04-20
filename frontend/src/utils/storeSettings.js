export const STORE_SETTINGS_CACHE_KEY = 'grocereStoreSettingsCache';

export const DEFAULT_WAIT_TIME_WARNING_MINUTES = 5;
export const DEFAULT_STORE_TIME_ZONE = 'UTC';
export const WEEKDAY_OPTIONS = [
  { key: '0', label: 'Sunday' },
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' }
];
export const DEFAULT_SCHEDULING_HOURS = WEEKDAY_OPTIONS.reduce((accumulator, day) => {
  accumulator[day.key] = Array.from({ length: 16 }, (_, index) => index + 8);
  return accumulator;
}, {});

const FALLBACK_TIME_ZONE_VALUES = [
  'UTC',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Halifax',
  'America/St_Johns',
  'Europe/London',
  'Europe/Paris',
  'Europe/Athens',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Pacific/Auckland'
];

const formatUtcOffsetLabel = (offsetMinutes) => {
  const totalMinutes = Number.isFinite(offsetMinutes) ? offsetMinutes : 0;
  const sign = totalMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  if (minutes === 0) {
    return `UTC${sign}${hours}`;
  }

  return `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
};

const getTimeZoneParts = (value, timeZoneName) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: value,
      timeZoneName,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());
  } catch {
    return [];
  }
};

const getTimeZoneOffsetMinutes = (value) => {
  const parts = getTimeZoneParts(value, 'longOffset');
  const offsetName = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  if (offsetName === 'GMT' || offsetName === 'UTC') {
    return 0;
  }

  const match = offsetName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * ((hours * 60) + minutes);
};

const getFriendlyTimeZoneName = (value) => {
  const parts = getTimeZoneParts(value, 'long');
  const rawName = String(parts.find((part) => part.type === 'timeZoneName')?.value || '').trim();
  if (!rawName || /^gmt/i.test(rawName) || /^utc/i.test(rawName)) {
    return 'Coordinated Universal Time';
  }

  return rawName;
};

export const getTimeZoneOption = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const normalizedValue = value.trim();
  const offsetMinutes = getTimeZoneOffsetMinutes(normalizedValue);
  const friendlyName = getFriendlyTimeZoneName(normalizedValue);

  return {
    value: normalizedValue,
    label: `${friendlyName} (${formatUtcOffsetLabel(offsetMinutes)})`,
    offsetMinutes,
    sortLabel: friendlyName
  };
};

export const TIME_ZONE_OPTIONS = (() => {
  const rawValues = (() => {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      try {
        const supported = Intl.supportedValuesOf('timeZone');
        if (Array.isArray(supported) && supported.length > 0) {
          return Array.from(new Set([DEFAULT_STORE_TIME_ZONE, ...supported]));
        }
      } catch {
      }
    }

    return FALLBACK_TIME_ZONE_VALUES;
  })();

  const definitionsByLabel = new Map();

  rawValues.forEach((value) => {
    const option = getTimeZoneOption(value);
    if (!option) {
      return;
    }

    const existing = definitionsByLabel.get(option.label);
    if (!existing || option.value === DEFAULT_STORE_TIME_ZONE) {
      definitionsByLabel.set(option.label, option);
    }
  });

  return Array.from(definitionsByLabel.values()).sort((left, right) => {
    if (left.offsetMinutes !== right.offsetMinutes) {
      return left.offsetMinutes - right.offsetMinutes;
    }

    return left.sortLabel.localeCompare(right.sortLabel);
  });
})();

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
  },
  scheduling: {
    timeZone: DEFAULT_STORE_TIME_ZONE,
    hoursByWeekday: DEFAULT_SCHEDULING_HOURS
  },
  storePhone: ''
};

const MAX_STORE_PHONE_LENGTH = 32;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const isUnsafeObjectKey = (key) => key === '__proto__' || key === 'prototype' || key === 'constructor';

const isValidTimeZone = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    new Intl.DateTimeFormat([], { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const normalizeTimeZone = (value) => (isValidTimeZone(value) ? value : DEFAULT_STORE_TIME_ZONE);

const normalizeStorePhone = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }

  const cleaned = String(value)
    .replace(/[^0-9+()\-\s.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, MAX_STORE_PHONE_LENGTH);
};

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

const normalizeSchedulingHours = (inputSchedulingHours) => {
  const source = inputSchedulingHours && typeof inputSchedulingHours === 'object' && !Array.isArray(inputSchedulingHours)
    ? inputSchedulingHours
    : {};

  return WEEKDAY_OPTIONS.reduce((accumulator, day) => {
    const inputHours = Array.isArray(source[day.key]) ? source[day.key] : DEFAULT_SCHEDULING_HOURS[day.key];
    accumulator[day.key] = Array.from(new Set(
      inputHours
        .map((hour) => Math.round(toNumber(hour, NaN)))
        .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)
    )).sort((left, right) => left - right);
    return accumulator;
  }, {});
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
  const scheduling = source.scheduling && typeof source.scheduling === 'object' ? source.scheduling : {};

  const hasGoal = (goalKey) => hasOwn(goals, goalKey) && goals[goalKey] && typeof goals[goalKey] === 'object';

  const waitTimeWarningMinutes = Math.max(1, Math.round(Math.min(1440, toNumber(source.waitTimeWarningMinutes, DEFAULT_WAIT_TIME_WARNING_MINUTES))));

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
    },
    scheduling: {
      timeZone: normalizeTimeZone(scheduling.timeZone),
      hoursByWeekday: normalizeSchedulingHours(scheduling.hoursByWeekday)
    },
    waitTimeWarningMinutes,
    storePhone: normalizeStorePhone(source.storePhone)
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
