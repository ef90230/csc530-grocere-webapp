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

const StatBar = ({ userName, pickRate }) => {
  const [profileName, setProfileName] = useState('');
  const [profilePickRate, setProfilePickRate] = useState(null);

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
  const rateState = getRateState(resolvedPickRate);

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