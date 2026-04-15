import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './CommoditySelectPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const formatDueTime = (dueTime) => {
    const dueDate = new Date(dueTime);

    if (Number.isNaN(dueDate.getTime())) {
        return '';
    }

    return dueDate.toLocaleTimeString([], {
        hour: 'numeric',
        minute: dueDate.getMinutes() === 0 ? undefined : '2-digit'
    });
};

const CommoditySelectPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [commodities, setCommodities] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [suppressAutoResume, setSuppressAutoResume] = useState(Boolean(location?.state?.completedWalk));

    useEffect(() => {
        if (!location?.state?.completedWalk) {
            return;
        }

        navigate('/commodityselect', { replace: true, state: null });
    }, [location?.state, navigate]);

    useEffect(() => {
        const token = window.localStorage.getItem('authToken');
        const userType = window.localStorage.getItem('userType');

        if (!token || (userType !== 'employee' && userType !== 'admin')) {
            navigate('/');
            return undefined;
        }

        const controller = new AbortController();

        const loadCommodityQueue = async () => {
            try {
                setErrorMessage('');

                const profileResponse = await fetch(`${API_BASE}/api/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    signal: controller.signal
                });

                if (!profileResponse.ok) {
                    throw new Error('Unable to load employee profile.');
                }

                const profilePayload = await profileResponse.json();
                const storeId = profilePayload?.user?.storeId;

                if (!storeId) {
                    throw new Error('No store is assigned to this employee.');
                }

                if (!suppressAutoResume) {
                    const activeWalkResponse = await fetch(`${API_BASE}/api/orders/picking/walk/current/${storeId}`, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        },
                        signal: controller.signal
                    });

                    if (!activeWalkResponse.ok) {
                        throw new Error('Unable to verify current pick walk state.');
                    }

                    const activeWalkPayload = await activeWalkResponse.json();
                    if (activeWalkPayload?.hasActiveWalk && activeWalkPayload?.commodity) {
                        navigate('/picking', {
                            state: {
                                commodity: activeWalkPayload.commodity,
                                commodityLabel: activeWalkPayload.displayName
                            }
                        });
                        return;
                    }
                }

                const queueResponse = await fetch(`${API_BASE}/api/orders/commodities/${storeId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    signal: controller.signal
                });

                if (!queueResponse.ok) {
                    throw new Error('Unable to load commodities ready for picking.');
                }

                const queuePayload = await queueResponse.json();
                setCommodities(Array.isArray(queuePayload?.commodities) ? queuePayload.commodities : []);

                if (suppressAutoResume) {
                    setSuppressAutoResume(false);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Unable to load commodity queue', error);
                    setErrorMessage(error.message || 'Unable to load commodities ready for picking.');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        loadCommodityQueue();

        const intervalId = window.setInterval(loadCommodityQueue, 30000);

        return () => {
            controller.abort();
            window.clearInterval(intervalId);
        };
    }, [navigate, suppressAutoResume]);

    const handleCommoditySelect = (commodity) => {
        setSuppressAutoResume(false);
        navigate('/picking', {
            state: {
                commodity: commodity.commodity,
                commodityLabel: commodity.displayName
            }
        });
    };

    return (
        <div className="commodity-select-page">
            <TopBar title="Picking" theme="green" />
            <main className="commodity-select-content">
                <section className="commodity-select-header-card">
                    <p className="commodity-select-eyebrow">Pick Queue</p>
                    <h1 className="commodity-select-title">Select a commodity to start a walk</h1>
                    <p className="commodity-select-description">
                        Orders shown here are overdue or due within the next 3 hours. Start with the commodity that has the earliest due time.
                    </p>
                </section>

                {errorMessage ? (
                    <section className="commodity-select-empty-state commodity-select-empty-state--error">
                        <h2>Unable to load picking work</h2>
                        <p>{errorMessage}</p>
                    </section>
                ) : null}

                {!errorMessage && isLoading ? (
                    <section className="commodity-select-empty-state">
                        <h2>Loading commodities...</h2>
                    </section>
                ) : null}

                {!errorMessage && !isLoading && commodities.length === 0 ? (
                    <section className="commodity-select-empty-state">
                        <h2>All done! Nothing to pick right now.</h2>
                        <p>Check back later for newly scheduled orders.</p>
                    </section>
                ) : null}

                {!errorMessage && !isLoading && commodities.length > 0 ? (
                    <section className="commodity-select-list" aria-label="Available commodities for picking">
                        {commodities.map((commodity) => (
                            <button
                                key={commodity.commodity}
                                type="button"
                                className="commodity-select-card"
                                onClick={() => handleCommoditySelect(commodity)}
                            >
                                <div className="commodity-select-card-main">
                                    <div className="commodity-select-card-header">
                                        <h2>{commodity.displayName}</h2>
                                        {commodity.isOverdue ? (
                                            <span className="commodity-select-overdue-badge">Overdue</span>
                                        ) : null}
                                    </div>
                                    <p className="commodity-select-card-meta">
                                        {commodity.itemCount} {commodity.itemCount === 1 ? 'item' : 'items'} available
                                    </p>
                                </div>

                                <div className="commodity-select-card-side">
                                    <span className="commodity-select-due-label">Due {formatDueTime(commodity.dueTime)}</span>
                                    <span className="commodity-select-chevron" aria-hidden="true">&gt;</span>
                                </div>
                            </button>
                        ))}
                    </section>
                ) : null}
            </main>
            <Navbar />
        </div>
    );
};

export default CommoditySelectPage;

