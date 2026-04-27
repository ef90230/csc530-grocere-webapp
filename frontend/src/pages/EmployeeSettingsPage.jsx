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

const API_BASE = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

const EmployeeSettingsPage = () => {
  const navigate = useNavigate();
  const [userType, setUserType] = useState(() => window.localStorage.getItem('userType') || '');
  const [employeeName, setEmployeeName] = useState(() => window.localStorage.getItem('userDisplayName') || 'User');
  const [employeeId, setEmployeeId] = useState(() => getStoredEmployeeId());
  const [settings, setSettings] = useState(() => readEmployeeSettingsFromCache(getStoredEmployeeId()));
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredStoreId, setPreferredStoreId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isClaimingAdmin, setIsClaimingAdmin] = useState(false);
  const [canBecomeAdmin, setCanBecomeAdmin] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isEmployeeLike = userType === 'employee' || userType === 'admin';
  const isEmployee = userType === 'employee';
  const isCustomer = userType === 'customer';

  useEffect(() => {
    const token = window.localStorage.getItem('authToken');
    const storedUserType = window.localStorage.getItem('userType');

    if (!token || (storedUserType !== 'employee' && storedUserType !== 'admin' && storedUserType !== 'customer')) {
      navigate('/');
      return;
    }

    setUserType(storedUserType);

    const loadProfile = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const headers = {
          Authorization: `Bearer ${token}`
        };

        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers
        });

        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          const profileId = payload?.user?.id;
          const profileFirstName = payload?.user?.firstName || '';
          const profileLastName = payload?.user?.lastName || '';
          const profilePhone = payload?.user?.phone || '';
          const profilePreferredStoreId = payload?.user?.preferredStoreId;
          const fullName = `${profileFirstName} ${profileLastName}`.trim();

          setFirstName(profileFirstName);
          setLastName(profileLastName);
          setPhone(profilePhone);
          setPreferredStoreId(
            profilePreferredStoreId === undefined || profilePreferredStoreId === null
              ? ''
              : String(profilePreferredStoreId)
          );

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
          setErrorMessage('Unable to load your account details.');
        }

        if (storedUserType === 'employee') {
          const adminSlotResponse = await fetch(`${API_BASE}/api/auth/admin-slot`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

          if (adminSlotResponse.ok) {
            const adminSlotPayload = await adminSlotResponse.json().catch(() => ({}));
            setCanBecomeAdmin(Boolean(adminSlotPayload?.available));
          }
        }
      } catch {
        setErrorMessage('Unable to load your account details.');
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

  const handleSaveProfile = async (event) => {
    event.preventDefault();

    const token = window.localStorage.getItem('authToken');
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedPhone = phone.trim();
    const normalizedPreferredStoreId = preferredStoreId.trim();

    if (!token || !normalizedFirstName || !normalizedLastName) {
      setErrorMessage('First and last name are required.');
      setStatusMessage('');
      return;
    }

    if (isCustomer && !normalizedPhone) {
      setErrorMessage('Phone number is required.');
      setStatusMessage('');
      return;
    }

    setIsSavingProfile(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          ...(isCustomer
            ? {
              phone: normalizedPhone,
              preferredStoreId: normalizedPreferredStoreId || null
            }
            : {})
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrorMessage(payload?.message || 'Unable to save profile updates.');
        return;
      }

      const fullName = `${payload?.user?.firstName || normalizedFirstName} ${payload?.user?.lastName || normalizedLastName}`.trim();
      setEmployeeName(fullName || 'User');
      window.localStorage.setItem('userDisplayName', fullName || 'User');
      setStatusMessage('Profile updated successfully.');
    } catch {
      setErrorMessage('Unable to save profile updates.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteAccount = () => {
    const token = window.localStorage.getItem('authToken');
    if (!token || isDeletingAccount) {
      return;
    }
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteAccount = async () => {
    setIsDeleteConfirmOpen(false);
    const token = window.localStorage.getItem('authToken');
    if (!token) {
      return;
    }

    setIsDeletingAccount(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrorMessage(payload?.message || 'Unable to delete account.');
        return;
      }

      window.localStorage.removeItem('authToken');
      window.localStorage.removeItem('userType');
      window.localStorage.removeItem('userDisplayName');
      window.localStorage.removeItem('employeeUserId');
      navigate('/');
    } catch {
      setErrorMessage('Unable to delete account.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleBecomeAdmin = async () => {
    const token = window.localStorage.getItem('authToken');
    if (!token || isClaimingAdmin) {
      return;
    }

    setIsClaimingAdmin(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/become-admin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrorMessage(payload?.message || 'Unable to claim the admin role.');
        return;
      }

      if (payload?.token) {
        window.localStorage.setItem('authToken', payload.token);
      }
      window.localStorage.setItem('userType', 'admin');
      setUserType('admin');
      setCanBecomeAdmin(false);
      setStatusMessage('You are now the admin for your store.');
    } catch {
      setErrorMessage('Unable to claim the admin role.');
    } finally {
      setIsClaimingAdmin(false);
    }
  };

  const backPath = isCustomer ? '/storefront' : '/home';

  return (
    <div className="employee-settings-page">
      {isEmployeeLike ? (
        <TopBar
          title="User Settings"
          userName={employeeName}
          leftActionLabel="<"
          leftActionAriaLabel="Back"
          onLeftAction={() => navigate(backPath)}
        />
      ) : (
        <header className="employee-settings-topbar">
          <button
            type="button"
            className="employee-settings-back-button"
            aria-label="Back"
            onClick={() => navigate(backPath)}
          >
            &lt;
          </button>
          <h1>User Settings</h1>
        </header>
      )}

      <main className="employee-settings-content">
        {isEmployee && canBecomeAdmin ? (
          <button
            type="button"
            className="employee-settings-become-admin"
            onClick={handleBecomeAdmin}
            disabled={isClaimingAdmin}
          >
            {isClaimingAdmin ? 'Claiming Admin Role...' : 'Become Admin'}
          </button>
        ) : null}

        <section className="employee-settings-header">
          <h1>{employeeName}</h1>
          <p>Update your account details and preferences.</p>
        </section>

        {isLoading ? <p className="employee-settings-message">Loading settings...</p> : null}

        {!isLoading ? (
          <section className="employee-settings-list" aria-label="Profile settings">
            <form className="employee-settings-profile-card" onSubmit={handleSaveProfile}>
              <h2>Profile</h2>
              <label htmlFor="settings-first-name">First Name</label>
              <input
                id="settings-first-name"
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                maxLength={60}
                required
              />

              <label htmlFor="settings-last-name">Last Name</label>
              <input
                id="settings-last-name"
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                maxLength={60}
                required
              />

              {isCustomer ? (
                <>
                  <label htmlFor="settings-phone">Phone Number</label>
                  <input
                    id="settings-phone"
                    type="text"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={32}
                    required
                  />

                  <label htmlFor="settings-preferred-store">Preferred Store Number or ID</label>
                  <input
                    id="settings-preferred-store"
                    type="text"
                    value={preferredStoreId}
                    onChange={(event) => setPreferredStoreId(event.target.value)}
                    maxLength={32}
                    placeholder="Optional"
                  />
                </>
              ) : null}

              <button type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </section>
        ) : null}

        {statusMessage ? <p className="employee-settings-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="employee-settings-error">{errorMessage}</p> : null}

        {!isLoading && isEmployeeLike ? (
          <section className="employee-settings-list employee-settings-stat-section" aria-label="Employee top bar settings">
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

        {!isLoading ? (
          <section className="employee-settings-danger-zone" aria-label="Delete account">
            <button
              type="button"
              className="employee-settings-delete-button"
              disabled={isDeletingAccount}
              onClick={handleDeleteAccount}
            >
              {isDeletingAccount ? 'Deleting Account...' : 'Delete Account'}
            </button>
          </section>
        ) : null}
      </main>

      {isEmployeeLike ? <Navbar /> : null}

      {isDeleteConfirmOpen ? (
        <div className="employee-settings-overlay" onClick={() => setIsDeleteConfirmOpen(false)}>
          <section className="employee-settings-confirm-card" onClick={(event) => event.stopPropagation()}>
            <h2 className="employee-settings-confirm-card__title">Delete Account</h2>
            <p className="employee-settings-confirm-card__message">Delete your account permanently? This action cannot be undone.</p>
            <div className="employee-settings-confirm-card__actions">
              <button
                type="button"
                className="employee-settings-confirm-card__button employee-settings-confirm-card__button--cancel"
                onClick={() => setIsDeleteConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="employee-settings-confirm-card__button employee-settings-confirm-card__button--confirm"
                onClick={handleConfirmDeleteAccount}
              >
                Delete Account
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default EmployeeSettingsPage;


