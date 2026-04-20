const DEFAULT_TIME_ZONE = 'UTC';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isValidTimeZone = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const normalizeTimeZone = (value, fallback = DEFAULT_TIME_ZONE) => {
  if (isValidTimeZone(value)) {
    return value;
  }

  return isValidTimeZone(fallback) ? fallback : DEFAULT_TIME_ZONE;
};

const getTimeZoneParts = (dateInput, timeZone = DEFAULT_TIME_ZONE) => {
  const date = new Date(dateInput);
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizedTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date).reduce((accumulator, entry) => {
    if (entry.type !== 'literal') {
      accumulator[entry.type] = entry.value;
    }

    return accumulator;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekdayShort: String(parts.weekday || '').toLowerCase(),
    timeZone: normalizedTimeZone
  };
};

const getTimeZoneOffsetMinutes = (dateInput, timeZone = DEFAULT_TIME_ZONE) => {
  const date = new Date(dateInput);
  const parts = getTimeZoneParts(date, timeZone);
  if (!parts || Number.isNaN(date.getTime())) {
    return 0;
  }

  const asUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0
  );

  return Math.round((asUtcMs - date.getTime()) / 60000);
};

const toTimeZoneDate = (dateInput, timeZone = DEFAULT_TIME_ZONE) => {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return new Date('invalid');
  }

  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  return new Date(date.getTime() + offsetMinutes * 60 * 1000);
};

const fromTimeZoneParts = (year, monthIndex, day, hour, minute = 0, second = 0, millisecond = 0, timeZone = DEFAULT_TIME_ZONE) => {
  const utcGuess = new Date(Date.UTC(year, monthIndex, day, hour, minute, second, millisecond));
  if (Number.isNaN(utcGuess.getTime())) {
    return new Date('invalid');
  }

  let offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  let resolved = new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
  const adjustedOffsetMinutes = getTimeZoneOffsetMinutes(resolved, timeZone);

  if (adjustedOffsetMinutes !== offsetMinutes) {
    offsetMinutes = adjustedOffsetMinutes;
    resolved = new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
  }

  return resolved;
};

const getTimeZoneDayKey = (dateInput = new Date(), timeZone = DEFAULT_TIME_ZONE) => {
  const parts = getTimeZoneParts(dateInput, timeZone);
  if (!parts) {
    return '';
  }

  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

const addDaysToDayKey = (dayKey, daysToAdd = 0) => {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  const baseDate = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0, 0));
  if (Number.isNaN(baseDate.getTime())) {
    return '';
  }

  baseDate.setUTCDate(baseDate.getUTCDate() + Math.round(toNumber(daysToAdd, 0)));
  return `${baseDate.getUTCFullYear()}-${String(baseDate.getUTCMonth() + 1).padStart(2, '0')}-${String(baseDate.getUTCDate()).padStart(2, '0')}`;
};

const getWeekdayIndexFromDayKey = (dayKey) => {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0, 0));
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return date.getUTCDay();
};

module.exports = {
  DEFAULT_TIME_ZONE,
  addDaysToDayKey,
  fromTimeZoneParts,
  getTimeZoneDayKey,
  getTimeZoneOffsetMinutes,
  getTimeZoneParts,
  getWeekdayIndexFromDayKey,
  isValidTimeZone,
  normalizeTimeZone,
  toTimeZoneDate
};