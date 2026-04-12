import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import {
  normalizeEmployeeSettings,
  readEmployeeSettingsFromCache,
  saveEmployeeSettingsToCache,
  getStoredEmployeeId
} from '../utils/employeeSettings';
import './EmployeeSettingsPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const EmployeeSettingsPage = () => {
  const navigate = useNavigate();
  const [employeeName, setEmployeeName] = useState(() => window.localStorage.getItem('userDisplayName') || 'Employee');
  const [employeeId, setEmployeeId] = useState(() => getStoredEmployeeId());
  const [settings, setSettings] = useState(() => readEmployeeSettingsFromCache(getStoredEmployeeId()));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem('authToken');
    const userType = window.localStorage.getItem('userType');

    if (!token || (userType !== 'employee' && userType !== 'admin')) {
      navigate('/');
      return;
    }

    const loadProfile = async () => {
      setIsLoading(true);

      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          const profileId = payload?.user?.id;
          const fullName = `${payload?.user?.firstName || ''} ${payload?.user?.lastName || ''}`.trim();

          if (fullName) {
            setEmployeeName(fullName);
            window.localStorage.setItem('userDisplayName', fullName);
          }

          if (profileId !== undefined && profileId !== null) {
            const resolvedEmployeeId = String(profileId);
            window.localStorage.setItem('employeeUserId', resolvedEmployeeId);
            setEmployeeId(resolvedEmployeeId);
            setSettings(readEmployeeSettingsFromCache(resolvedEmployeeId));
          }
        } else {
          const fallbackEmployeeId = getStoredEmployeeId();
          setEmployeeId(fallbackEmployeeId);
          setSettings(readEmployeeSettingsFromCache(fallbackEmployeeId));
        }
      } catch {
        const fallbackEmployeeId = getStoredEmployeeId();
        setEmployeeId(fallbackEmployeeId);
        setSettings(readEmployeeSettingsFromCache(fallbackEmployeeId));
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  const handleToggle = (settingKey, checked) => {
    const nextSettings = normalizeEmployeeSettings({
      ...settings,
      [settingKey]: checked
    });

    setSettings(nextSettings);
    saveEmployeeSettingsToCache(employeeId, nextSettings);
  };

  return (
    <div className="employee-settings-page">
      <TopBar
        title="User Settings"
        leftActionLabel="<"
        leftActionAriaLabel="Back to home"
        onLeftAction={() => navigate('/home')}
      />

      <main className="employee-settings-content">
        <section className="employee-settings-header">
          <h1>{employeeName}</h1>
          <p>Choose what appears in your top status bar while you work.</p>
        </section>

        {isLoading ? <p className="employee-settings-message">Loading settings...</p> : null}

        {!isLoading ? (
          <section className="employee-settings-list" aria-label="Employee top bar settings">
            <label className="employee-settings-item" htmlFor="toggle-live-pick-rate-day">
              <span className="employee-settings-item-copy">
                <strong>Display Live Pick Rate for the Day</strong>
                <small>
                  When enabled, the top status bar outside pick walks shows your daily live pick rate.
                  When disabled, it shows your name only.
                </small>
              </span>
              <input
                id="toggle-live-pick-rate-day"
                type="checkbox"
                checked={settings.displayLivePickRateForDay}
                onChange={(event) => handleToggle('displayLivePickRateForDay', event.target.checked)}
              />
            </label>

            <label className="employee-settings-item" htmlFor="toggle-live-pick-rate-walk">
              <span className="employee-settings-item-copy">
                <strong>Display Live Pick Rate for Each Walk</strong>
                <small>
                  When enabled, the picking top status bar shows your live walk pick rate.
                  When disabled, it shows your name only.
                </small>
              </span>
              <input
                id="toggle-live-pick-rate-walk"
                type="checkbox"
                checked={settings.displayLivePickRateForEachWalk}
                onChange={(event) => handleToggle('displayLivePickRateForEachWalk', event.target.checked)}
              />
            </label>
          </section>
        ) : null}
      </main>

      <Navbar />
    </div>
  );
};

export default EmployeeSettingsPage;


