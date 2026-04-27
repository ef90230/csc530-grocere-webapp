import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import {
    normalizeStoreSettings,
    saveStoreSettingsToCache
} from '../utils/storeSettings';
import './StatisticsPage.css';

const API_BASE = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

const METRIC_CARDS = [
  {
    key: 'pickRate',
    label: 'Pick rate',
    unit: '/hr',
        goalKey: 'pickRateGoal',
    size: 'large',
    section: 'picking'
  },
  {
    key: 'firstTimePickPercent',
    label: 'First-time pick',
    unit: '%',
        goalKey: 'firstTimePickRateGoal',
    size: 'large',
    section: 'picking'
  },
  {
    key: 'preSubstitutionPercent',
    label: 'Pre-substitution',
    unit: '%',
        goalKey: 'preSubstitutionGoal',
    size: 'small',
    section: 'picking'
  },
  {
    key: 'postSubstitutionPercent',
    label: 'Post-substitution',
    unit: '%',
        goalKey: 'postSubstitutionGoal',
    size: 'small',
    section: 'picking'
  },
  {
    key: 'onTimePercent',
    label: 'On-time',
    unit: '%',
        goalKey: 'onTimePickPercentGoal',
    size: 'small',
    section: 'picking'
  },
  {
    key: 'percentNotFound',
    label: 'Percent not found',
    unit: '%',
    size: 'small',
    section: 'picking'
  },
  {
    key: 'itemsPicked',
    label: 'Items picked',
    size: 'small',
    section: 'picking'
  },
  {
    key: 'weightedEfficiency',
    label: 'Efficiency score',
    size: 'small',
    section: 'picking'
    },
    {
        key: 'totesStaged',
        label: 'Totes staged',
        size: 'small',
        section: 'staging'
    },
    {
        key: 'itemsStaged',
        label: 'Items staged',
        size: 'small',
        section: 'staging'
    },
    {
        key: 'ordersDispensed',
        label: 'Orders dispensed',
        size: 'small',
        section: 'dispensing'
    },
    {
        key: 'totesDispensed',
        label: 'Totes dispensed',
        size: 'small',
        section: 'dispensing'
    },
    {
        key: 'itemsDispensed',
        label: 'Items dispensed',
        size: 'small',
        section: 'dispensing'
    },
    {
        key: 'avgWaitTimeMinutes',
        label: 'Avg wait time',
        size: 'small',
        section: 'dispensing',
        storeOnly: true,
        lowerIsBetter: true,
        goalKey: 'waitTimeWarningMinutes'
    },
    {
        key: 'cumulativeWaitTimeMinutes',
        label: 'Cumulative wait',
        size: 'small',
        section: 'dispensing',
        storeOnly: true
    }
];

const METRIC_INFO_CONTENT = {
    pickRate: {
        title: 'Pick Rate',
        body: 'The rate of items picked during pick walks over the time spent picking. It is measured in items per hour. A low pick rate in a majority of employees is a sign the pick path is not very efficient, or they are having trouble finding common items.'
    },
    firstTimePickPercent: {
        title: 'First-time Pick',
        body: 'The percentage of items found without making a mistake over all items in pick walks. A mistake is defined as skipping, pressing Item Not Found, or scanning or entering the wrong UPC or PLU code. A low First-time Pick may imply that items may be in stock, but they are stocked in the wrong location.'
    },
    preSubstitutionPercent: {
        title: 'Pre-substitution',
        body: 'The percentage of originally ordered items found over total original items ordered. A low pre-substitution may mean that items popular with customers are running out of stock.'
    },
    postSubstitutionPercent: {
        title: 'Post-substitution',
        body: 'The combined percentage of originally ordered and substituted items found over total original items ordered.'
    },
    onTimePercent: {
        title: 'On-time',
        body: 'The percentage of items picked without going overdue over all items ordered. If picks begin running overdue, it is a sign that order volume may be too high for the store to handle. Consider adding more staff, or restricting the number of orders that may be scheduled at certain times.'
    },
    percentNotFound: {
        title: 'Percent Not Found',
        body: 'The combined quantity of original items and substitutes marked as not found over all items ordered.'
    },
    weightedEfficiency: {
        title: 'Efficiency Score',
        body: 'A weighted score that combines the total picks, first-time pick, pre-substitution, and % not found stats.'
    },
    avgWaitTimeMinutes: {
        title: 'Avg Wait Time',
        body: 'Average time spent checked in by customers without the order being completed. High wait times may occur as a natural consequence of many cars checked in at the same time.'
    },
    cumulativeWaitTimeMinutes: {
        title: 'Cumulative Wait',
        body: 'Total time spent checked in by all customers without their orders being completed.'
    }
};

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatWalkStartedAt = (value) => {
    const startedAt = new Date(value);
    if (Number.isNaN(startedAt.getTime())) {
        return 'Unknown walk time';
    }

    return startedAt.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const formatWaitTime = (totalMinutes) => {
    const mins = toNumber(totalMinutes);
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};

const formatValue = (metric, value) => {
  const safeValue = toNumber(value);

    if (metric.key === 'avgWaitTimeMinutes') {
        return formatWaitTime(safeValue);
    }

    if (metric.key === 'cumulativeWaitTimeMinutes') {
        return formatWaitTime(safeValue);
    }

  if (metric.key === 'itemsPicked') {
    return Math.round(safeValue).toLocaleString();
  }

    if (metric.section === 'staging' || metric.section === 'dispensing') {
        return Math.round(safeValue).toLocaleString();
    }

  if (metric.key === 'pickRate') {
    return safeValue.toFixed(2);
  }

  return safeValue.toFixed(1);
};

const getMetricTone = (metric, value, storeSettings) => {
    if (!metric.goalKey) {
        return 'neutral';
    }

    const safeValue = toNumber(value);

    // waitTimeWarningMinutes is a top-level store setting, not inside goals
    if (metric.key === 'avgWaitTimeMinutes') {
        const warningMinutes = toNumber(storeSettings?.waitTimeWarningMinutes) || 5;
        if (safeValue <= 0) return 'neutral';
        return safeValue < warningMinutes ? 'success' : 'danger';
    }

    const goalSetting = storeSettings?.goals?.[metric.goalKey];
    if (!goalSetting || goalSetting.enabled === false) {
    return 'neutral';
  }

    const goalValue = toNumber(goalSetting.value);

    if (metric.lowerIsBetter) {
        if (safeValue < goalValue) return 'success';
        if (safeValue > goalValue) return 'danger';
        return 'neutral';
    }

    if (safeValue > goalValue) {
    return 'success';
  }

    if (safeValue < goalValue) {
    return 'danger';
  }

  return 'neutral';
};

const formatGoalLabel = (metric, storeSettings) => {
    if (!metric.goalKey) {
        return '';
    }

    if (metric.key === 'avgWaitTimeMinutes') {
        const warningMinutes = toNumber(storeSettings?.waitTimeWarningMinutes) || 5;
        return `Goal: < ${warningMinutes} min`;
    }

    const goalSetting = storeSettings?.goals?.[metric.goalKey];
    if (!goalSetting || goalSetting.enabled === false) {
        return 'Goal disabled';
    }

    const numericGoal = toNumber(goalSetting.value);
    if (metric.unit === '/hr') {
        return `Goal: ${numericGoal.toFixed(2)}/hr`;
    }

    return `Goal: ${Math.round(numericGoal)}%`;
};

const StatisticsPage = () => {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);
    const [activeScope, setActiveScope] = useState('you');
    const [activeRange, setActiveRange] = useState('today');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeInfoMetricKey, setActiveInfoMetricKey] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            setError('Unable to load employee statistics without an active session.');
            setIsLoading(false);
            return;
        }

        const controller = new AbortController();

        const loadSummary = async () => {
            try {
                const response = await fetch(`${API_BASE}/api/employees/stats/summary`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    signal: controller.signal
                });

                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(payload?.message || 'Failed to load statistics.');
                }

                setSummary(payload);
                setError('');
            } catch (fetchError) {
                if (fetchError.name === 'AbortError') {
                    return;
                }
                setError(fetchError.message || 'Failed to load statistics.');
            } finally {
                setIsLoading(false);
            }
        };

        loadSummary();

        return () => controller.abort();
    }, []);

    const userFullName = useMemo(() => {
        if (!summary?.user) {
            return localStorage.getItem('userDisplayName') || 'Employee';
        }

        const firstName = summary.user.firstName || '';
        const lastName = summary.user.lastName || '';
        const displayName = `${firstName} ${lastName}`.trim();

        return displayName || localStorage.getItem('userDisplayName') || 'Employee';
    }, [summary]);

    const activeStats = useMemo(() => {
        if (!summary) {
            return null;
        }

        const timeframeKey = activeRange === 'allTime' ? 'statsAllTime' : 'statsToday';

        if (activeScope === 'store') {
            return summary.store?.[timeframeKey] || summary.store?.stats || null;
        }

        return summary.user?.[timeframeKey] || summary.user?.stats || null;
    }, [activeRange, activeScope, summary]);

    const pickRateForTopBar = useMemo(() => {
        return toNumber(summary?.user?.statsToday?.pickRate ?? summary?.user?.stats?.pickRate);
    }, [summary]);

    const walkHistory = useMemo(() => {
        return Array.isArray(summary?.user?.walkHistory) ? summary.user.walkHistory : [];
    }, [summary]);

    const storeSettings = useMemo(() => {
        const settings = normalizeStoreSettings(summary?.store?.settings);
        saveStoreSettingsToCache(settings);

        // Prefer the threshold the employee configured in the Order List options menu
        // (stored in localStorage) over the backend default.
        const storedThreshold = Number(window.localStorage.getItem('grocereWaitThresholdMinutes'));
        const localThreshold = Number.isInteger(storedThreshold) && storedThreshold >= 1 && storedThreshold <= 1440
            ? storedThreshold
            : null;

        return localThreshold !== null
            ? { ...settings, waitTimeWarningMinutes: localThreshold }
            : settings;
    }, [summary?.store?.settings]);

    return (
        <div className="statistics-page">
            <TopBar title="My Stats" userName={userFullName} pickRate={pickRateForTopBar} />
            <div className="statistics-content">
                <div className="statistics-header-row">
                    <h1>{activeScope === 'store' ? 'Store Stats' : userFullName}</h1>
                    <button type="button" className="leaderboard-button" onClick={() => navigate('/leaderboard')}>
                        Leaderboard
                    </button>
                </div>

                <div className="statistics-toggle-row">
                    <div className="toggle-group" role="tablist" aria-label="Stats scope">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeScope === 'you'}
                            className={`toggle-pill ${activeScope === 'you' ? 'active' : ''}`}
                            onClick={() => setActiveScope('you')}
                        >
                            You
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeScope === 'store'}
                            className={`toggle-pill ${activeScope === 'store' ? 'active' : ''}`}
                            onClick={() => setActiveScope('store')}
                        >
                            Store
                        </button>
                    </div>

                    <div className="toggle-group" aria-label="Date range">
                        <button
                            type="button"
                            className={`toggle-pill ${activeRange === 'today' ? 'active' : ''}`}
                            onClick={() => setActiveRange('today')}
                            aria-pressed={activeRange === 'today'}
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            className={`toggle-pill ${activeRange === 'allTime' ? 'active' : ''}`}
                            onClick={() => setActiveRange('allTime')}
                            aria-pressed={activeRange === 'allTime'}
                        >
                            All time
                        </button>
                    </div>
                </div>

                {isLoading && <p className="statistics-message">Loading statistics...</p>}
                {!isLoading && error && <p className="statistics-message statistics-message--error">{error}</p>}

                {!isLoading && !error && activeStats && (
                    <>
                        <section className="stats-section" aria-label="Picking">
                            <h2>Picking</h2>
                            <div className="metrics-grid metrics-grid--large">
                                {METRIC_CARDS.filter((card) => card.section === 'picking' && card.size === 'large').map((metric) => {
                                    const value = activeStats[metric.key];
                                    const tone = getMetricTone(metric, value, storeSettings);
                                    const goalLabel = formatGoalLabel(metric, storeSettings);

                                    return (
                                        <article key={metric.key} className={`metric-card metric-card--${tone} metric-card--large`}>
                                            {METRIC_INFO_CONTENT[metric.key] ? (
                                                <button
                                                    type="button"
                                                    className="metric-card-info-button"
                                                    aria-label={`${metric.label} information`}
                                                    onClick={() => setActiveInfoMetricKey(metric.key)}
                                                >
                                                    i
                                                </button>
                                            ) : null}
                                            <div className="metric-card-value">
                                                {formatValue(metric, value)}
                                                {metric.unit ? <span className="metric-card-unit">{metric.unit}</span> : null}
                                            </div>
                                            <p className="metric-card-label">{metric.label}</p>
                                            {goalLabel ? <p className="metric-card-goal">{goalLabel}</p> : null}
                                        </article>
                                    );
                                })}
                            </div>

                            <div className="metrics-grid metrics-grid--small">
                                {METRIC_CARDS.filter((card) => card.section === 'picking' && card.size === 'small').map((metric) => {
                                    const value = activeStats[metric.key];
                                    const tone = getMetricTone(metric, value, storeSettings);
                                    const goalLabel = formatGoalLabel(metric, storeSettings);

                                    return (
                                        <article key={metric.key} className={`metric-card metric-card--${tone} metric-card--small`}>
                                            {METRIC_INFO_CONTENT[metric.key] ? (
                                                <button
                                                    type="button"
                                                    className="metric-card-info-button"
                                                    aria-label={`${metric.label} information`}
                                                    onClick={() => setActiveInfoMetricKey(metric.key)}
                                                >
                                                    i
                                                </button>
                                            ) : null}
                                            <div className="metric-card-value">
                                                {formatValue(metric, value)}
                                                {metric.unit ? <span className="metric-card-unit">{metric.unit}</span> : null}
                                            </div>
                                            <p className="metric-card-label">{metric.label}</p>
                                            {goalLabel ? <p className="metric-card-goal">{goalLabel}</p> : null}
                                        </article>
                                    );
                                })}
                            </div>

                        </section>

                        <section className="stats-section" aria-label="Staging">
                            <h2>Staging</h2>
                            <div className="metrics-grid metrics-grid--small">
                                {METRIC_CARDS.filter((card) => card.section === 'staging').map((metric) => {
                                    const value = activeStats[metric.key];

                                    return (
                                        <article key={metric.key} className="metric-card metric-card--neutral metric-card--small">
                                            <div className="metric-card-value">{formatValue(metric, value)}</div>
                                            <p className="metric-card-label">{metric.label}</p>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="stats-section" aria-label="Dispensing">
                            <h2>Dispensing</h2>
                            <div className="metrics-grid metrics-grid--small">
                                {METRIC_CARDS.filter((card) => card.section === 'dispensing' && (!card.storeOnly || activeScope === 'store')).map((metric) => {
                                    const value = activeStats[metric.key];
                                    const tone = getMetricTone(metric, value, storeSettings);
                                    const goalLabel = formatGoalLabel(metric, storeSettings);

                                    return (
                                        <article key={metric.key} className={`metric-card metric-card--${tone} metric-card--small`}>
                                            {METRIC_INFO_CONTENT[metric.key] ? (
                                                <button
                                                    type="button"
                                                    className="metric-card-info-button"
                                                    aria-label={`${metric.label} information`}
                                                    onClick={() => setActiveInfoMetricKey(metric.key)}
                                                >
                                                    i
                                                </button>
                                            ) : null}
                                            <div className="metric-card-value">{formatValue(metric, value)}</div>
                                            <p className="metric-card-label">{metric.label}</p>
                                            {goalLabel ? <p className="metric-card-goal">{goalLabel}</p> : null}
                                        </article>
                                    );
                                })}
                            </div>
                        </section>

                        {activeScope === 'you' ? (
                            <details className="walk-history-section">
                                <summary className="walk-history-summary">
                                    <div className="walk-history-header-row">
                                        <h3>Pick Walk History</h3>
                                        <span>{walkHistory.length} walks</span>
                                    </div>
                                </summary>

                                <div className="walk-history-content">
                                    {walkHistory.length > 0 ? (
                                        <div className="walk-history-list" role="list" aria-label="Pick walk history">
                                            {walkHistory.map((walk, index) => (
                                                <article className="walk-history-card" key={`${walk.startedAt}-${walk.commodity}-${index}`} role="listitem">
                                                    <div className="walk-history-card-top-row">
                                                        <div>
                                                            <p className="walk-history-commodity">{walk.commodityLabel || walk.commodity || 'Commodity'}</p>
                                                            <p className="walk-history-date">{formatWalkStartedAt(walk.startedAt)}</p>
                                                        </div>
                                                        <div className="walk-history-rate-block">
                                                            <strong>{toNumber(walk.pickRate).toFixed(2)}/hr</strong>
                                                            <span>Pick rate</span>
                                                        </div>
                                                    </div>

                                                    <div className="walk-history-metrics-row">
                                                        <div>
                                                            <span className="walk-history-metric-label">Items</span>
                                                            <strong>{`${Math.round(toNumber(walk.itemsPicked))}/${Math.round(toNumber(walk.initialTotal))}`}</strong>
                                                        </div>
                                                        <div>
                                                            <span className="walk-history-metric-label">Orders</span>
                                                            <strong>{Math.round(toNumber(walk.orderCount))}</strong>
                                                        </div>
                                                        <div>
                                                            <span className="walk-history-metric-label">FTPR</span>
                                                            <strong>{`${toNumber(walk.firstTimePickRate).toFixed(1)}%`}</strong>
                                                        </div>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="walk-history-empty">No completed pick walks yet.</p>
                                    )}
                                </div>
                            </details>
                        ) : null}
                    </>
                )}
            </div>
            {activeInfoMetricKey && METRIC_INFO_CONTENT[activeInfoMetricKey] ? (
                <div className="stats-info-overlay" onClick={() => setActiveInfoMetricKey('')}>
                    <div className="stats-info-overlay-hint">Click anywhere outside this card to close this menu</div>
                    <section className="stats-info-card" onClick={(event) => event.stopPropagation()}>
                        <h2>{METRIC_INFO_CONTENT[activeInfoMetricKey].title}</h2>
                        <p>{METRIC_INFO_CONTENT[activeInfoMetricKey].body}</p>
                    </section>
                </div>
            ) : null}
            <Navbar />
        </div>
    );
};

export default StatisticsPage;