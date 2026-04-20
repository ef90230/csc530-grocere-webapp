import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './AlertManagementPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const FILTER_OPTIONS = [
  { value: 'newest', label: 'Newest first', mode: 'sort' },
  { value: 'oldest', label: 'Oldest first', mode: 'sort' },
  { value: 'item_report', label: 'Item reports', mode: 'type' },
  { value: 'map_report', label: 'Map reports', mode: 'type' },
  { value: 'out_of_stock', label: 'Out of Stock alerts', mode: 'type' },
  { value: 'picker_alert', label: 'Picker alerts', mode: 'type' },
  { value: 'employee_comment', label: 'Employee comments', mode: 'type' },
  { value: 'order_canceled', label: 'Order canceled', mode: 'type' },
  { value: 'picks_overdue', label: 'Picks went overdue', mode: 'type' }
];

const ALERT_STYLE_BY_TYPE = {
  item_report: {
    className: 'alert-management-card--item-report',
    defaultActionLabel: 'Item Info'
  },
  map_report: {
    className: 'alert-management-card--map-report',
    defaultActionLabel: 'Store Map'
  },
  out_of_stock: {
    className: 'alert-management-card--out-of-stock',
    defaultActionLabel: 'Item Info'
  },
  picker_alert: {
    className: 'alert-management-card--picker-alert',
    defaultActionLabel: 'Leaderboard'
  },
  employee_comment: {
    className: 'alert-management-card--employee-comment',
    defaultActionLabel: ''
  },
  order_canceled: {
    className: 'alert-management-card--order-canceled',
    defaultActionLabel: 'Order List'
  },
  picks_overdue: {
    className: 'alert-management-card--picks-overdue',
    defaultActionLabel: 'Pick List'
  }
};

const formatTimestamp = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Time unavailable';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const resolveSelectState = (value) => {
  if (value === 'oldest' || value === 'newest') {
    return { sort: value, type: '' };
  }

  return { sort: 'newest', type: value };
};

const AlertManagementPage = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('newest');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [dismissingAlertId, setDismissingAlertId] = useState('');

  useEffect(() => {
    const token = window.localStorage.getItem('authToken');
    const userType = window.localStorage.getItem('userType');

    if (!token || userType !== 'admin') {
      navigate('/home');
      return undefined;
    }

    const controller = new AbortController();

    const loadAlerts = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');

        const { sort, type } = resolveSelectState(selectedFilter);
        const params = new URLSearchParams();
        params.set('sort', sort);
        if (type) {
          params.set('type', type);
        }
        if (searchTerm.trim()) {
          params.set('search', searchTerm.trim());
        }

        const response = await fetch(`${API_BASE}/api/alerts?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'Unable to load comments and alerts.');
        }

        setAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setErrorMessage(error.message || 'Unable to load comments and alerts.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadAlerts();
    return () => controller.abort();
  }, [navigate, searchTerm, selectedFilter]);

  const sortedAlerts = useMemo(() => alerts, [alerts]);

  const handleDismiss = async (alertId) => {
    const token = window.localStorage.getItem('authToken');
    if (!token) {
      return;
    }

    setDismissingAlertId(alertId);
    try {
      const response = await fetch(`${API_BASE}/api/alerts/${alertId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to dismiss alert.');
      }

      setAlerts((previous) => previous.filter((alert) => alert.id !== alertId));
    } catch (error) {
      setErrorMessage(error.message || 'Unable to dismiss alert.');
    } finally {
      setDismissingAlertId('');
    }
  };

  const handleAction = (alert) => {
    const target = alert?.actionTarget;
    if (!target?.path) {
      return;
    }

    navigate(target.path, { state: target.state || {} });
  };

  return (
    <div className="alert-management-page">
      <TopBar title="Store Comments and Alerts" leftActionLabel="<" leftActionAriaLabel="Back to home" onLeftAction={() => navigate('/home')} />

      <main className="alert-management-content">
        <section className="alert-management-controls">
          <input
            type="text"
            className="alert-management-search"
            placeholder="Search..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <select
            className="alert-management-filter"
            value={selectedFilter}
            onChange={(event) => setSelectedFilter(event.target.value)}
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </section>

        {errorMessage ? <p className="alert-management-message alert-management-message--error">{errorMessage}</p> : null}
        {isLoading ? <p className="alert-management-message">Loading alerts...</p> : null}

        {!isLoading && !errorMessage ? (
          <section className="alert-management-list" aria-label="Store comments and alerts">
            {sortedAlerts.length === 0 ? (
              <article className="alert-management-empty">
                <h2>No alerts right now.</h2>
                <p>New employee comments and system alerts will appear here.</p>
              </article>
            ) : sortedAlerts.map((alert) => {
              const styleConfig = ALERT_STYLE_BY_TYPE[alert.type] || ALERT_STYLE_BY_TYPE.employee_comment;
              const actionLabel = alert.actionLabel || styleConfig.defaultActionLabel;
              const hasAction = Boolean(actionLabel && alert.actionTarget?.path);
              const showWarning = alert.type === 'order_canceled' || alert.type === 'picks_overdue';

              return (
                <article key={alert.id} className={`alert-management-card ${styleConfig.className}`}>
                  <div className="alert-management-card-copy">
                    <div className="alert-management-card-heading-row">
                      <h2>{alert.title}</h2>
                      {showWarning ? <span className="alert-management-warning">!</span> : null}
                    </div>
                    {alert.subject ? <p className="alert-management-subject">{alert.subject}</p> : null}
                    {alert.message && alert.message !== alert.subject ? (
                      <p className="alert-management-message-copy">{alert.message}</p>
                    ) : null}
                    <span className="alert-management-time">{formatTimestamp(alert.createdAt)}</span>
                  </div>

                  <div className="alert-management-actions">
                    {hasAction ? (
                      <button
                        type="button"
                        className="alert-management-action-button"
                        onClick={() => handleAction(alert)}
                      >
                        {actionLabel}
                      </button>
                    ) : <div className="alert-management-action-spacer" />}
                    <button
                      type="button"
                      className="alert-management-dismiss-button"
                      aria-label="Dismiss alert"
                      onClick={() => handleDismiss(alert.id)}
                      disabled={dismissingAlertId === alert.id}
                    >
                      {dismissingAlertId === alert.id ? '…' : '✓'}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </main>

      <Navbar />
    </div>
  );
};

export default AlertManagementPage;