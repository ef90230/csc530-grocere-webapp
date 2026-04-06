import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import {
  normalizeStoreSettings,
  saveStoreSettingsToCache
} from '../utils/storeSettings';
import './StoreSettingsPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const GOAL_FIELDS = [
  {
    key: 'pickRateGoal',
    label: 'Pick rate goal (items/hr)',
    min: 0.01,
    max: 9999,
    step: 0.01,
    integer: false
  },
  {
    key: 'firstTimePickRateGoal',
    label: 'First-time pick rate goal (%)',
    min: 0,
    max: 100,
    step: 1,
    integer: true
  },
  {
    key: 'preSubstitutionGoal',
    label: 'Pre-substitution goal (%)',
    min: 0,
    max: 100,
    step: 1,
    integer: true
  },
  {
    key: 'postSubstitutionGoal',
    label: 'Post-substitution goal (%)',
    min: 0,
    max: 100,
    step: 1,
    integer: true
  },
  {
    key: 'onTimePickPercentGoal',
    label: 'On-time pick percent goal (%)',
    min: 0,
    max: 100,
    step: 1,
    integer: true
  }
];

const clamp = (value, minValue, maxValue) => Math.min(maxValue, Math.max(minValue, value));

const MAX_MESSAGE_LENGTH = 180;

const sanitizeDisplayText = (value, fallback = '') => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const collapsed = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const noAngleBrackets = collapsed.replace(/[<>]/g, '');
  if (!noAngleBrackets) {
    return fallback;
  }

  return noAngleBrackets.slice(0, MAX_MESSAGE_LENGTH);
};

const parseFiniteNumber = (rawValue, fallback) => {
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
    return fallback;
  }

  const normalized = String(rawValue).trim();
  if (!normalized) {
    return fallback;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return fallback;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const StoreSettingsPage = () => {
  const navigate = useNavigate();
  const [storeSummary, setStoreSummary] = useState({ name: 'Store', storeNumber: '' });
  const [settings, setSettings] = useState(() => normalizeStoreSettings(null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = window.localStorage.getItem('authToken');
    const userType = window.localStorage.getItem('userType');

    if (!token || userType !== 'employee') {
      navigate('/');
      return;
    }

    const loadSettings = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch(`${API_BASE}/api/employees/store-settings`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.message || 'Unable to load store settings.');
        }

        const normalizedSettings = normalizeStoreSettings(payload?.settings);
        setSettings(normalizedSettings);
        saveStoreSettingsToCache(normalizedSettings);
        setStoreSummary({
          name: sanitizeDisplayText(payload?.store?.name, 'Store'),
          storeNumber: sanitizeDisplayText(String(payload?.store?.storeNumber || ''), '')
        });
      } catch (fetchError) {
        setError(sanitizeDisplayText(fetchError?.message, 'Unable to load store settings.'));
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [navigate]);

  const normalizedSettings = useMemo(() => normalizeStoreSettings(settings), [settings]);

  const handleToggleGoal = (goalKey, enabledValue) => {
    setSettings((previousSettings) => {
      const current = normalizeStoreSettings(previousSettings);
      return {
        ...current,
        goals: {
          ...current.goals,
          [goalKey]: {
            ...current.goals[goalKey],
            enabled: enabledValue
          }
        }
      };
    });
  };

  const handleGoalValueChange = (goalKey, nextValue, fieldConfig) => {
    setSettings((previousSettings) => {
      const current = normalizeStoreSettings(previousSettings);
      const safeNumber = parseFiniteNumber(nextValue, current.goals[goalKey].value);
      const bounded = clamp(safeNumber, fieldConfig.min, fieldConfig.max);

      return {
        ...current,
        goals: {
          ...current.goals,
          [goalKey]: {
            ...current.goals[goalKey],
            value: fieldConfig.integer ? Math.round(bounded) : bounded
          }
        }
      };
    });
  };

  const handleTimeslotLimitChange = (nextValue) => {
    setSettings((previousSettings) => {
      const current = normalizeStoreSettings(previousSettings);
      const parsed = parseFiniteNumber(nextValue, current.timeslot.defaultLimit);
      const safeValue = Number.isInteger(parsed) && parsed > 0 ? parsed : current.timeslot.defaultLimit;

      return {
        ...current,
        timeslot: {
          ...current.timeslot,
          defaultLimit: safeValue
        }
      };
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const token = window.localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/employees/store-settings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          settings: normalizedSettings
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to save store settings.');
      }

      const savedSettings = normalizeStoreSettings(payload?.settings);
      setSettings(savedSettings);
      saveStoreSettingsToCache(savedSettings);
      setMessage('Store settings saved.');
    } catch (saveError) {
      setError(sanitizeDisplayText(saveError?.message, 'Unable to save store settings.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="store-settings-page">
      <TopBar
        title="Store Settings"
        theme="purple"
        leftActionLabel="<"
        leftActionAriaLabel="Back to home"
        onLeftAction={() => navigate('/home')}
      />

      <main className="store-settings-content">
        <section className="store-settings-header">
          <h1>{storeSummary.name}</h1>
          {storeSummary.storeNumber ? <p>Store {storeSummary.storeNumber}</p> : null}
        </section>

        {isLoading ? <p className="store-settings-message">Loading settings...</p> : null}
        {!isLoading && error ? <p className="store-settings-message store-settings-message--error">{error}</p> : null}
        {!isLoading && message ? <p className="store-settings-message store-settings-message--success">{message}</p> : null}

        {!isLoading ? (
          <form className="store-settings-form" onSubmit={handleSave}>
            <section className="store-settings-section">
              <h2>Goal Configuration</h2>
              {GOAL_FIELDS.map((field) => {
                const goalSetting = normalizedSettings.goals[field.key];

                return (
                  <article key={field.key} className="store-settings-goal-row">
                    <div className="store-settings-goal-main">
                      <label htmlFor={`goal-${field.key}`}>{field.label}</label>
                      <input
                        id={`goal-${field.key}`}
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={goalSetting.value}
                        disabled={!goalSetting.enabled}
                        onChange={(event) => handleGoalValueChange(field.key, event.target.value, field)}
                      />
                    </div>
                    <label className="store-settings-toggle">
                      <input
                        type="checkbox"
                        checked={!goalSetting.enabled}
                        onChange={(event) => handleToggleGoal(field.key, !event.target.checked)}
                      />
                      Disable goal
                    </label>
                  </article>
                );
              })}
            </section>

            <section className="store-settings-section">
              <h2>Timeslot Order Limit</h2>
              <div className="store-settings-timeslot-row">
                <label htmlFor="timeslot-limit-input">Orders per timeslot</label>
                <input
                  id="timeslot-limit-input"
                  type="number"
                  min={1}
                  step={1}
                  value={normalizedSettings.timeslot.defaultLimit}
                  onChange={(event) => handleTimeslotLimitChange(event.target.value)}
                />
              </div>
              <p className="store-settings-hint">
                When this limit is lowered, any timeslot already above the new limit keeps its prior limit until a later update can adopt the new value safely.
              </p>
            </section>

            <div className="store-settings-actions">
              <button type="submit" className="store-settings-save-btn" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        ) : null}
      </main>

      <Navbar />
    </div>
  );
};

export default StoreSettingsPage;
