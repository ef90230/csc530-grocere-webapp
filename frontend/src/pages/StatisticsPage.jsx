import React, { useEffect, useMemo, useState } from 'react';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import {
    normalizeStoreSettings,
    saveStoreSettingsToCache
} from '../utils/storeSettings';
import './StatisticsPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
  }
];

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

const formatValue = (metric, value) => {
  const safeValue = toNumber(value);

  if (metric.key === 'itemsPicked') {
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

    const goalSetting = storeSettings?.goals?.[metric.goalKey];
    if (!goalSetting || goalSetting.enabled === false) {
    return 'neutral';
  }

  const safeValue = toNumber(value);
    const goalValue = toNumber(goalSetting.value);

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
    const [summary, setSummary] = useState(null);
    const [activeScope, setActiveScope] = useState('you');
    const [activeRange, setActiveRange] = useState('today');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

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
        return settings;
    }, [summary?.store?.settings]);

    return (
        <div className="statistics-page">
            <TopBar userName={userFullName} pickRate={pickRateForTopBar} />
            <div className="statistics-content">
                <div className="statistics-header-row">
                    <h1>{activeScope === 'store' ? 'Store Stats' : userFullName}</h1>
                    <button type="button" className="leaderboard-button" disabled>
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

                            {activeScope === 'you' ? (
                                <div className="walk-history-section">
                                    <div className="walk-history-header-row">
                                        <h3>Pick Walk History</h3>
                                        <span>{walkHistory.length} walks</span>
                                    </div>

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
                            ) : null}
                        </section>

                        <section className="stats-section" aria-label="Staging">
                            <h2>Staging</h2>
                            <article className="metric-card metric-card--neutral metric-card--single">
                                <div className="metric-card-value">{Math.round(toNumber(activeStats.totesStaged))}</div>
                                <p className="metric-card-label">Totes staged</p>
                            </article>
                        </section>

                        <section className="stats-section" aria-label="Dispensing">
                            <h2>Dispensing</h2>
                            <article className="metric-card metric-card--neutral metric-card--single">
                                <div className="metric-card-value">{Math.round(toNumber(activeStats.ordersDispensed))}</div>
                                <p className="metric-card-label">Orders dispensed</p>
                            </article>
                        </section>
                    </>
                )}
            </div>
            <Navbar />
        </div>
    );
};

export default StatisticsPage;