import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
const TYPE_SORT_ORDER = ['ambient', 'chilled', 'frozen', 'hot', 'oversized'];

const buildGroupKey = (orderId, commodity) => `${orderId}:${commodity}`;

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

const getCommodityGroupStatuses = (order, assignmentByGroup) => {
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

    return Array.from(grouped.entries())
        .map(([commodity, items]) => {
            const hasPendingItem = items.some((orderItem) => String(orderItem?.status || '').toLowerCase() === 'pending');
            const groupKey = buildGroupKey(order?.id, commodity);
            const stagedAssignment = assignmentByGroup[groupKey] || null;

            let status = 'unstaged';

            if (stagedAssignment || STAGED_ORDER_STATUSES.has(String(order?.status || '').toLowerCase())) {
                status = 'staged';
            } else if (hasPendingItem) {
                status = 'picking';
            }

            return {
                commodity,
                label: COMMODITY_DISPLAY_NAMES[commodity] || commodity,
                status,
                assignment: stagedAssignment
            };
        })
        .sort((left, right) => {
            const leftTypeIndex = TYPE_SORT_ORDER.indexOf(left.commodity);
            const rightTypeIndex = TYPE_SORT_ORDER.indexOf(right.commodity);

            if (leftTypeIndex !== rightTypeIndex) {
                return (leftTypeIndex === -1 ? TYPE_SORT_ORDER.length : leftTypeIndex)
                    - (rightTypeIndex === -1 ? TYPE_SORT_ORDER.length : rightTypeIndex);
            }

            return left.label.localeCompare(right.label);
        });
};

const StagingPage = () => {
    const navigate = useNavigate();
    const routeLocation = useLocation();
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const [locations, setLocations] = useState([]);
    const [assignmentByGroup, setAssignmentByGroup] = useState({});
    const [selectedLocationByGroup, setSelectedLocationByGroup] = useState({});
    const [updatingGroupKey, setUpdatingGroupKey] = useState('');
    const [highlightedGroupKey, setHighlightedGroupKey] = useState('');

    const loadLocationData = async (token, signal) => {
        const [locationsResponse, assignmentsResponse] = await Promise.all([
            fetch(`${API_BASE}/api/staging-locations`, {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                signal
            }),
            fetch(`${API_BASE}/api/staging-locations/assignments`, {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                signal
            })
        ]);

        if (!locationsResponse.ok) {
            throw new Error('Unable to load staging locations.');
        }

        if (!assignmentsResponse.ok) {
            throw new Error('Unable to load staged item groups.');
        }

        const locationsPayload = await locationsResponse.json();
        const assignmentsPayload = await assignmentsResponse.json();

        const resolvedLocations = Array.isArray(locationsPayload?.locations) ? locationsPayload.locations : [];
        const resolvedAssignments = Array.isArray(assignmentsPayload?.assignments) ? assignmentsPayload.assignments : [];

        const nextAssignmentByGroup = resolvedAssignments.reduce((accumulator, assignment) => {
            const key = buildGroupKey(assignment.orderId, assignment.commodity);
            accumulator[key] = assignment;
            return accumulator;
        }, {});

        setLocations(resolvedLocations);
        setAssignmentByGroup(nextAssignmentByGroup);
    };

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

                const [ordersResponse] = await Promise.all([
                    fetch(`${API_BASE}/api/orders?storeId=${storeId}`, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        },
                        signal: controller.signal
                    }),
                    loadLocationData(token, controller.signal)
                ]);

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
                const commodityGroups = getCommodityGroupStatuses(order, assignmentByGroup);
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
            }, [orders, assignmentByGroup]);

    useEffect(() => {
        if (!expandedOrderId) {
            return;
        }

        const isExpandedOrderStillVisible = stagingOrders.some((entry) => entry.order.id === expandedOrderId);
        if (!isExpandedOrderStillVisible) {
            setExpandedOrderId(null);
        }
    }, [expandedOrderId, stagingOrders]);

    useEffect(() => {
        const focusOrderId = Number(routeLocation?.state?.focusOrderId);
        const focusCommodity = String(routeLocation?.state?.focusCommodity || '').toLowerCase();

        if (!Number.isInteger(focusOrderId)) {
            return;
        }

        const hasOrderInQueue = stagingOrders.some((entry) => entry.order.id === focusOrderId);
        if (!hasOrderInQueue) {
            return;
        }

        setExpandedOrderId(focusOrderId);
        if (focusCommodity) {
            setHighlightedGroupKey(buildGroupKey(focusOrderId, focusCommodity));
        }

        window.setTimeout(() => {
            const target = focusCommodity
                ? document.getElementById(`staging-group-${focusOrderId}-${focusCommodity}`)
                : document.getElementById(`staging-order-${focusOrderId}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 90);

        navigate('/staging', { replace: true, state: {} });
    }, [navigate, routeLocation?.state, stagingOrders]);

    const toggleOrderExpanded = (orderId) => {
        setExpandedOrderId((current) => (current === orderId ? null : orderId));
    };

    const handleLocationSelection = (orderId, commodity, locationId) => {
        const key = buildGroupKey(orderId, commodity);
        setSelectedLocationByGroup((current) => ({
            ...current,
            [key]: locationId
        }));
    };

    const refreshStagingMeta = async () => {
        const token = window.localStorage.getItem('authToken');
        if (!token) {
            return;
        }

        await loadLocationData(token);
    };

    const assignGroupToLocation = async (orderId, commodity) => {
        const key = buildGroupKey(orderId, commodity);
        const selectedLocationId = Number(selectedLocationByGroup[key]);

        if (!Number.isInteger(selectedLocationId)) {
            setErrorMessage('Please select a valid location before staging this item group.');
            return;
        }

        const token = window.localStorage.getItem('authToken');
        if (!token) {
            navigate('/');
            return;
        }

        setUpdatingGroupKey(key);
        setErrorMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/staging-locations/assignments`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderId,
                    commodity,
                    stagingLocationId: selectedLocationId
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to stage this item group.');
            }

            await refreshStagingMeta();
        } catch (error) {
            console.error('Unable to assign item group to location', error);
            setErrorMessage(error.message || 'Unable to stage this item group.');
        } finally {
            setUpdatingGroupKey('');
        }
    };

    const unassignGroup = async (orderId, commodity) => {
        const key = buildGroupKey(orderId, commodity);
        const token = window.localStorage.getItem('authToken');
        if (!token) {
            navigate('/');
            return;
        }

        setUpdatingGroupKey(key);
        setErrorMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/staging-locations/assignments`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderId,
                    commodity
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to unstage this item group.');
            }

            await refreshStagingMeta();
        } catch (error) {
            console.error('Unable to unassign item group from location', error);
            setErrorMessage(error.message || 'Unable to unstage this item group.');
        } finally {
            setUpdatingGroupKey('');
        }
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

                <button
                    type="button"
                    className="staging-manage-button"
                    onClick={() => navigate('/staging/locations')}
                >
                    Manage Locations
                </button>

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
                                <article key={orderId} id={`staging-order-${orderId}`} className="staging-order-card">
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
                                                <div
                                                    key={`${orderId}-${group.commodity}`}
                                                    id={`staging-group-${orderId}-${group.commodity}`}
                                                    className={`staging-group-row ${highlightedGroupKey === buildGroupKey(orderId, group.commodity) ? 'staging-group-row--highlight' : ''}`}
                                                >
                                                    <div className="staging-group-main">
                                                        <span className="staging-group-label">{group.label}</span>
                                                        <span className={`staging-group-status staging-group-status--${group.status}`}>
                                                            {getGroupStatusLabel(group.status)}
                                                        </span>
                                                        {group.assignment?.stagingLocation?.name ? (
                                                            <p className="staging-group-location">
                                                                Location: {group.assignment.stagingLocation.name}
                                                            </p>
                                                        ) : null}
                                                    </div>

                                                    <div className="staging-group-actions">
                                                        {group.status === 'staged' ? (
                                                            <button
                                                                type="button"
                                                                className="staging-action-btn staging-action-btn--danger"
                                                                onClick={() => unassignGroup(orderId, group.commodity)}
                                                                disabled={updatingGroupKey === buildGroupKey(orderId, group.commodity)}
                                                            >
                                                                {updatingGroupKey === buildGroupKey(orderId, group.commodity) ? 'Working...' : 'Unstage'}
                                                            </button>
                                                        ) : group.status === 'unstaged' ? (
                                                            <>
                                                                <select
                                                                    className="staging-location-select"
                                                                    value={selectedLocationByGroup[buildGroupKey(orderId, group.commodity)] || ''}
                                                                    onChange={(event) => handleLocationSelection(orderId, group.commodity, event.target.value)}
                                                                >
                                                                    <option value="">Select location</option>
                                                                    {locations
                                                                        .filter((location) => location.itemType === group.commodity)
                                                                        .sort((left, right) => left.name.localeCompare(right.name))
                                                                        .map((location) => (
                                                                            <option key={location.id} value={location.id}>
                                                                                {location.name} ({Number(location.toteCount || 0)}/{Number(location.stagingLimit || 10)})
                                                                            </option>
                                                                        ))}
                                                                </select>
                                                                <button
                                                                    type="button"
                                                                    className="staging-action-btn"
                                                                    disabled={
                                                                        !selectedLocationByGroup[buildGroupKey(orderId, group.commodity)]
                                                                        || updatingGroupKey === buildGroupKey(orderId, group.commodity)
                                                                    }
                                                                    onClick={() => assignGroupToLocation(orderId, group.commodity)}
                                                                >
                                                                    {updatingGroupKey === buildGroupKey(orderId, group.commodity) ? 'Working...' : 'Stage'}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="staging-action-btn staging-action-btn--muted"
                                                                disabled
                                                            >
                                                                Picking In Progress
                                                            </button>
                                                        )}
                                                    </div>
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