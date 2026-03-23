import React, { useEffect, useMemo, useState } from 'react';
import './StatBar.css';

const TARGET_PICK_RATE = 100;
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const getRateState = (pickRate) => {
  if (!Number.isFinite(pickRate)) {
    return 'on-target';
  }

  if (pickRate > TARGET_PICK_RATE) {
    return 'above-target';
  }

  if (pickRate < TARGET_PICK_RATE) {
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
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (mode !== 'walk') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTick(Date.now());
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [mode]);

  useEffect(() => {
    const token = window.localStorage.getItem('authToken');
    const userType = window.localStorage.getItem('userType');

    if (!token || userType !== 'employee') {
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
        const firstName = payload?.user?.firstName || '';
        const lastName = payload?.user?.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const numericPickRate = Number(payload?.user?.pickRate);

        if (fullName) {
          setProfileName(fullName);
          window.localStorage.setItem('userDisplayName', fullName);
        }

        if (Number.isFinite(numericPickRate)) {
          setProfilePickRate(numericPickRate);
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

  const rateState = getRateState(mode === 'walk' ? walkPickRate : resolvedPickRate);

  if (mode === 'walk') {
    return (
      <>
        <section className={`statbar statbar--${rateState}`} aria-label="Current pick walk stats">
          <div className="statbar-walk-progress">
            <span className="statbar-walk-progress-count">{walkCompleted}/{walkTotal}</span>
            <div className="statbar-walk-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={walkProgressPercent}>
              <div className="statbar-walk-fill" style={{ width: `${walkProgressPercent}%` }} />
            </div>
          </div>
          <span className="statbar-rate">Live Pick Rate: {formatPickRate(walkPickRate)}</span>
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