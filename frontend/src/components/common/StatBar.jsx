import React, { useEffect, useMemo, useState } from 'react';
import {
  readStoreSettingsFromCache,
  normalizeStoreSettings,
  saveStoreSettingsToCache
} from '../../utils/storeSettings';
import {
  DEFAULT_EMPLOYEE_SETTINGS,
  getStoredEmployeeId,
  readEmployeeSettingsFromCache
} from '../../utils/employeeSettings';
import {
  getRemainingWalkTimeMs,
  isTimeLimitedCommodity,
  readActiveWalkTimeLimit
} from '../../utils/walkTimeLimit';
import './StatBar.css';

const TARGET_PICK_RATE = 100;
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const getRateState = (pickRate, goalValue = TARGET_PICK_RATE, goalEnabled = true) => {
  if (!goalEnabled) {
    return 'on-target';
  }

  if (!Number.isFinite(pickRate)) {
    return 'on-target';
  }

  if (pickRate > goalValue) {
    return 'above-target';
  }

  if (pickRate < goalValue) {
    return 'below-target';
  }

  return 'on-target';
};

const formatPickRate = (pickRate) => {
  if (!Number.isFinite(pickRate)) {
    return '—';
  }

  if (Number.isInteger(pickRate)) {
    return pickRate.toString();
  }

  return pickRate.toFixed(1);
};

const formatRemainingWalkTime = (remainingMs) => {
  const totalSeconds = Math.max(0, Math.floor(Number(remainingMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const resolveStoredName = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem('userDisplayName') || '';
};

const StatBar = ({
  userName,
  pickRate,
  mode = 'default',
  walkCompletedUnits = 0,
  walkTotalUnits = 0,
  walkStartedAt
}) => {
  const [profileName, setProfileName] = useState('');
  const [profilePickRate, setProfilePickRate] = useState(null);
  const [storeSettings, setStoreSettings] = useState(() => readStoreSettingsFromCache());
  const [employeeId, setEmployeeId] = useState(() => getStoredEmployeeId());
  const [employeeSettings, setEmployeeSettings] = useState(() => readEmployeeSettingsFromCache(getStoredEmployeeId()));
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    setEmployeeSettings(readEmployeeSettingsFromCache(employeeId));
  }, [employeeId]);

  useEffect(() => {
    if (mode !== 'walk') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [mode]);

  useEffect(() => {
    const token = window.localStorage.getItem('authToken');
    const userType = window.localStorage.getItem('userType');

    if (!token || (userType !== 'employee' && userType !== 'admin')) {
      return;
    }

    const controller = new AbortController();

    const loadEmployeeProfile = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const profileId = payload?.user?.id;
        const firstName = payload?.user?.firstName || '';
        const lastName = payload?.user?.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const numericPickRate = Number(payload?.user?.pickRate);

        if (profileId !== undefined && profileId !== null) {
          const resolvedEmployeeId = String(profileId);
          window.localStorage.setItem('employeeUserId', resolvedEmployeeId);
          setEmployeeId(resolvedEmployeeId);
        }

        if (fullName) {
          setProfileName(fullName);
          window.localStorage.setItem('userDisplayName', fullName);
        }

        if (Number.isFinite(numericPickRate)) {
          setProfilePickRate(numericPickRate);
        }

        const employeeStoreId = Number(payload?.user?.storeId);
        if (Number.isInteger(employeeStoreId) && employeeStoreId > 0) {
          const settingsResponse = await fetch(`${API_BASE}/api/employees/store-settings`, {
            headers: {
              Authorization: `Bearer ${token}`
            },
            signal: controller.signal
          });

          if (settingsResponse.ok) {
            const settingsPayload = await settingsResponse.json();
            const normalizedSettings = normalizeStoreSettings(settingsPayload?.settings);
            setStoreSettings(normalizedSettings);
            saveStoreSettingsToCache(normalizedSettings);
          }
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Unable to load employee profile for StatBar', error);
        }
      }
    };

    loadEmployeeProfile();

    return () => controller.abort();
  }, []);

  const resolvedPickRate = useMemo(() => {
    const propPickRate = Number(pickRate);
    if (Number.isFinite(propPickRate)) {
      return propPickRate;
    }

    const fetchedPickRate = Number(profilePickRate);
    if (Number.isFinite(fetchedPickRate)) {
      return fetchedPickRate;
    }

    return null;
  }, [pickRate, profilePickRate]);

  const resolvedUserName = userName || profileName || resolveStoredName() || 'Employee';

  const walkTotal = Math.max(Number(walkTotalUnits || 0), 0);
  const walkCompleted = Math.max(Number(walkCompletedUnits || 0), 0);
  const walkProgressPercent = walkTotal > 0
    ? Math.min(100, Math.round((walkCompleted / walkTotal) * 100))
    : 0;

  const walkElapsedHours = useMemo(() => {
    if (!walkStartedAt) {
      return 0;
    }

    const startTime = new Date(walkStartedAt);
    if (Number.isNaN(startTime.getTime())) {
      return 0;
    }

    const elapsedMs = Math.max(0, tick - startTime.getTime());
    return elapsedMs / (1000 * 60 * 60);
  }, [walkStartedAt, tick]);

  const walkPickRate = useMemo(() => {
    if (walkElapsedHours <= 0) {
      return 0;
    }

    return walkCompleted / walkElapsedHours;
  }, [walkCompleted, walkElapsedHours]);
  const activeWalkTimeLimit = mode === 'walk' ? readActiveWalkTimeLimit() : null;
  const walkTimeRemainingMs = useMemo(() => {
    if (!activeWalkTimeLimit || !isTimeLimitedCommodity(activeWalkTimeLimit.commodity)) {
      return null;
    }

    return getRemainingWalkTimeMs(tick);
  }, [activeWalkTimeLimit, tick]);

  const pickRateGoal = storeSettings?.goals?.pickRateGoal || { enabled: true, value: TARGET_PICK_RATE };
  const rateState = getRateState(
    mode === 'walk' ? walkPickRate : resolvedPickRate,
    Number(pickRateGoal.value) || TARGET_PICK_RATE,
    Boolean(pickRateGoal.enabled)
  );
  const showDayPickRate = employeeSettings?.displayLivePickRateForDay ?? DEFAULT_EMPLOYEE_SETTINGS.displayLivePickRateForDay;
  const showWalkPickRate = employeeSettings?.displayLivePickRateForEachWalk ?? DEFAULT_EMPLOYEE_SETTINGS.displayLivePickRateForEachWalk;

  if (mode === 'walk') {
    if (!showWalkPickRate) {
      return (
        <>
          <section className="statbar statbar--on-target" aria-label="Employee walk stats">
            <span className="statbar-name">{resolvedUserName}</span>
          </section>
          <div className="statbar-spacer" />
        </>
      );
    }

    return (
      <>
        <section className={`statbar statbar--${rateState}`} aria-label="Current pick walk stats">
          <div className="statbar-walk-progress">
            <span className="statbar-walk-progress-count">{walkCompleted}/{walkTotal}</span>
            <div className="statbar-walk-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={walkProgressPercent}>
              <div className="statbar-walk-fill" style={{ width: `${walkProgressPercent}%` }} />
            </div>
          </div>
          {walkTimeRemainingMs !== null ? (
            <span className={`statbar-walk-timer ${walkTimeRemainingMs <= 5 * 60 * 1000 ? 'statbar-walk-timer--urgent' : ''}`}>
              {formatRemainingWalkTime(walkTimeRemainingMs)}
            </span>
          ) : null}
          <span className="statbar-rate">Live Pick Rate: {formatPickRate(walkPickRate)}</span>
        </section>
        <div className="statbar-spacer" />
      </>
    );
  }

  if (!showDayPickRate) {
    return (
      <>
        <section className="statbar statbar--on-target" aria-label="Employee daily stats">
          <span className="statbar-name">{resolvedUserName}</span>
        </section>
        <div className="statbar-spacer" />
      </>
    );
  }

  return (
    <>
      <section
        className={`statbar statbar--${rateState}`}
        aria-label="Employee daily stats"
      >
        <span className="statbar-name">{resolvedUserName}</span>
        <span className="statbar-rate">Today's Pick Rate: {formatPickRate(resolvedPickRate)}</span>
      </section>
      <div className="statbar-spacer" />
    </>
  );
};

export default StatBar;