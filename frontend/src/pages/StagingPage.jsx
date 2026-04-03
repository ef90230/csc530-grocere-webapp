import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './StagingPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const COMMODITY_DISPLAY_NAMES = {
    ambient: 'Ambient',
    chilled: 'Chilled',
    frozen: 'Frozen',
    hot: 'Hot',
    oversized: 'Oversized',
    restricted: 'Team Lift'
};

const STAGED_ORDER_STATUSES = new Set(['staged', 'ready', 'dispensing', 'completed']);

const formatDueTime = (value) => {
    if (!value) {
        return 'Due time unavailable';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Due time unavailable';
    }

    return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
    });
};

const getCustomerName = (order) => {
    const firstName = order?.customer?.firstName || '';
    const lastName = order?.customer?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || 'Customer';
};

const getCommodityGroupStatuses = (order) => {
    const grouped = new Map();
    const orderItems = Array.isArray(order?.items) ? order.items : [];

    orderItems.forEach((orderItem) => {
        const commodityKey = String(orderItem?.item?.commodity || '').toLowerCase();
        if (!commodityKey) {
            return;
        }

        if (!grouped.has(commodityKey)) {
            grouped.set(commodityKey, []);
        }

        grouped.get(commodityKey).push(orderItem);
    });

    const orderStatus = String(order?.status || '').toLowerCase();

    return Array.from(grouped.entries())
        .map(([commodity, items]) => {
            const hasPendingItem = items.some((orderItem) => String(orderItem?.status || '').toLowerCase() === 'pending');

            let status = 'unstaged';

            if (STAGED_ORDER_STATUSES.has(orderStatus)) {
                status = 'staged';
            } else if (hasPendingItem) {
                status = 'picking';
            }

            return {
                commodity,
                label: COMMODITY_DISPLAY_NAMES[commodity] || commodity,
                status
            };
        })
        .sort((left, right) => left.label.localeCompare(right.label));
};

const StagingPage = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [expandedOrderId, setExpandedOrderId] = useState(null);

    useEffect(() => {
        const token = window.localStorage.getItem('authToken');
        const userType = window.localStorage.getItem('userType');

        if (!token || userType !== 'employee') {
            navigate('/');
            return undefined;
        }

        const controller = new AbortController();

        const loadStagingOrders = async () => {
            try {
                setErrorMessage('');
                setIsLoading(true);

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

                const ordersResponse = await fetch(`${API_BASE}/api/orders?storeId=${storeId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    signal: controller.signal
                });

                if (!ordersResponse.ok) {
                    throw new Error('Unable to load staging queue.');
                }

                const ordersPayload = await ordersResponse.json();
                const resolvedOrders = Array.isArray(ordersPayload?.orders) ? ordersPayload.orders : [];
                setOrders(resolvedOrders);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Unable to load staging queue', error);
                    setErrorMessage(error.message || 'Unable to load staging queue.');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        loadStagingOrders();

        const intervalId = window.setInterval(loadStagingOrders, 30000);

        return () => {
            controller.abort();
            window.clearInterval(intervalId);
        };
    }, [navigate]);

    const stagingOrders = useMemo(() => {
        return orders
            .map((order) => {
                const commodityGroups = getCommodityGroupStatuses(order);
                const stagedGroups = commodityGroups.filter((group) => group.status === 'staged').length;
                const hasUnstagedGroups = commodityGroups.some((group) => group.status !== 'staged');

                return {
                    order,
                    commodityGroups,
                    stagedGroups,
                    totalGroups: commodityGroups.length,
                    hasUnstagedGroups
                };
            })
            .filter((entry) => entry.totalGroups > 0 && entry.hasUnstagedGroups)
            .sort((left, right) => new Date(left.order?.scheduledPickupTime) - new Date(right.order?.scheduledPickupTime));
    }, [orders]);

    useEffect(() => {
        if (!expandedOrderId) {
            return;
        }

        const isExpandedOrderStillVisible = stagingOrders.some((entry) => entry.order.id === expandedOrderId);
        if (!isExpandedOrderStillVisible) {
            setExpandedOrderId(null);
        }
    }, [expandedOrderId, stagingOrders]);

    const toggleOrderExpanded = (orderId) => {
        setExpandedOrderId((current) => (current === orderId ? null : orderId));
    };

    const getGroupStatusLabel = (status) => {
        if (status === 'staged') {
            return 'Staged';
        }

        if (status === 'picking') {
            return 'Picking';
        }

        return 'Unstaged';
    };

    return (
        <div className="staging-page">
            <TopBar title="Staging" theme="red" />

            <main className="staging-content">
                <section className="staging-header-card">
                    <h1>Reorganize items by temperature type and the order they belong to.</h1>
                    <p>Select an order for more information.</p>
                </section>

                {errorMessage ? (
                    <section className="staging-empty-state staging-empty-state--error">
                        <h2>Unable to load staging orders</h2>
                        <p>{errorMessage}</p>
                    </section>
                ) : null}

                {!errorMessage && isLoading ? (
                    <section className="staging-empty-state">
                        <h2>Loading staging queue...</h2>
                    </section>
                ) : null}

                {!errorMessage && !isLoading && stagingOrders.length === 0 ? (
                    <section className="staging-empty-state">
                        <h2>No orders need your attention right now.</h2>
                    </section>
                ) : null}

                {!errorMessage && !isLoading && stagingOrders.length > 0 ? (
                    <section className="staging-order-list" aria-label="Orders requiring staging">
                        {stagingOrders.map((entry) => {
                            const orderId = entry.order.id;
                            const isExpanded = expandedOrderId === orderId;

                            return (
                                <article key={orderId} className="staging-order-card">
                                    <button
                                        type="button"
                                        className="staging-order-button"
                                        onClick={() => toggleOrderExpanded(orderId)}
                                        aria-expanded={isExpanded}
                                        aria-controls={`staging-groups-${orderId}`}
                                    >
                                        <div>
                                            <p className="staging-order-customer">{getCustomerName(entry.order)}</p>
                                            <p className="staging-order-meta">
                                                Order {entry.order.orderNumber || `#${orderId}`} • Due {formatDueTime(entry.order.scheduledPickupTime)}
                                            </p>
                                        </div>
                                        <span className="staging-order-progress">
                                            {entry.stagedGroups}/{entry.totalGroups}
                                        </span>
                                    </button>

                                    {isExpanded ? (
                                        <div id={`staging-groups-${orderId}`} className="staging-group-breakdown">
                                            {entry.commodityGroups.map((group) => (
                                                <div key={`${orderId}-${group.commodity}`} className="staging-group-row">
                                                    <span className="staging-group-label">{group.label}</span>
                                                    <span className={`staging-group-status staging-group-status--${group.status}`}>
                                                        {getGroupStatusLabel(group.status)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
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

export default StagingPage;