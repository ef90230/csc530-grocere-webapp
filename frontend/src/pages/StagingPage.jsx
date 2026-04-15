import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    const [isLocationCodePromptOpen, setIsLocationCodePromptOpen] = useState(false);
    const [locationCodePromptContext, setLocationCodePromptContext] = useState(null);
    const [locationCodeEntry, setLocationCodeEntry] = useState('');
    const [locationCodePromptError, setLocationCodePromptError] = useState('');
    const [locationCodeBypassSeconds, setLocationCodeBypassSeconds] = useState(5);
    const [isLocationCodeBypassReady, setIsLocationCodeBypassReady] = useState(false);
    const [isLocationCodeScannerOpen, setIsLocationCodeScannerOpen] = useState(false);
    const [locationCodeScannerMessage, setLocationCodeScannerMessage] = useState('');

    const locationCodeScannerVideoRef = useRef(null);
    const locationCodeScannerStreamRef = useRef(null);
    const locationCodeScannerDetectorRef = useRef(null);
    const locationCodeScannerFrameRef = useRef(null);
    const locationCodeScannerHandlingRef = useRef(false);

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

    const normalizeCodeValue = (value = '') => String(value || '').trim();

    const stopLocationCodeScannerSession = () => {
        if (locationCodeScannerFrameRef.current) {
            window.cancelAnimationFrame(locationCodeScannerFrameRef.current);
            locationCodeScannerFrameRef.current = null;
        }

        if (locationCodeScannerStreamRef.current) {
            locationCodeScannerStreamRef.current.getTracks().forEach((track) => track.stop());
            locationCodeScannerStreamRef.current = null;
        }

        locationCodeScannerDetectorRef.current = null;
        locationCodeScannerHandlingRef.current = false;

        if (locationCodeScannerVideoRef.current) {
            locationCodeScannerVideoRef.current.srcObject = null;
        }
    };

    const closeLocationCodeScanner = () => {
        stopLocationCodeScannerSession();
        setIsLocationCodeScannerOpen(false);
    };

    const closeLocationCodePrompt = () => {
        setIsLocationCodePromptOpen(false);
        setLocationCodePromptContext(null);
        setLocationCodeEntry('');
        setLocationCodePromptError('');
        setLocationCodeBypassSeconds(5);
        setIsLocationCodeBypassReady(false);
        closeLocationCodeScanner();
    };

    const assignGroupToLocationInternal = async (orderId, commodity, selectedLocationId) => {
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

    const handleLocationCodeSubmit = async () => {
        if (!locationCodePromptContext) {
            return;
        }

        const enteredCode = normalizeCodeValue(locationCodeEntry);
        const expectedCode = normalizeCodeValue(locationCodePromptContext?.location?.locationCode);

        if (!enteredCode) {
            setLocationCodePromptError('Please scan or enter the location code.');
            return;
        }

        if (enteredCode !== expectedCode) {
            setLocationCodePromptError('Location code does not match.');
            return;
        }

        const { orderId, commodity, selectedLocationId } = locationCodePromptContext;
        closeLocationCodePrompt();
        await assignGroupToLocationInternal(orderId, commodity, selectedLocationId);
    };

    const handleLocationCodeBypass = async () => {
        if (!isLocationCodeBypassReady || !locationCodePromptContext) {
            return;
        }

        const { orderId, commodity, selectedLocationId } = locationCodePromptContext;
        closeLocationCodePrompt();
        await assignGroupToLocationInternal(orderId, commodity, selectedLocationId);
    };

    const handleOpenLocationCodeScanner = async () => {
        setLocationCodeScannerMessage('');

        const BarcodeDetectorApi = window.BarcodeDetector;
        const mediaDevices = navigator?.mediaDevices;

        if (!BarcodeDetectorApi || !mediaDevices?.getUserMedia) {
            setLocationCodeScannerMessage('Camera unavailable');
            return;
        }

        try {
            const supportedFormats = typeof BarcodeDetectorApi.getSupportedFormats === 'function'
                ? await BarcodeDetectorApi.getSupportedFormats()
                : [];
            const requestedFormats = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'];
            const detectorFormats = supportedFormats.length > 0
                ? requestedFormats.filter((format) => supportedFormats.includes(format))
                : requestedFormats;

            if (supportedFormats.length > 0 && detectorFormats.length === 0) {
                setLocationCodeScannerMessage('No supported barcode formats found on this device.');
                return;
            }

            const stream = await mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' }
                },
                audio: false
            });

            locationCodeScannerStreamRef.current = stream;
            locationCodeScannerDetectorRef.current = new BarcodeDetectorApi({ formats: detectorFormats });
            setIsLocationCodeScannerOpen(true);
        } catch (error) {
            console.error('Unable to open location code scanner', error);
            stopLocationCodeScannerSession();
            setIsLocationCodeScannerOpen(false);
            setLocationCodeScannerMessage('Camera unavailable');
        }
    };

    useEffect(() => {
        const token = window.localStorage.getItem('authToken');
        const userType = window.localStorage.getItem('userType');

        if (!token || (userType !== 'employee' && userType !== 'admin')) {
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

        const selectedLocation = locations.find((location) => Number(location.id) === selectedLocationId);
        const normalizedLocationCode = normalizeCodeValue(selectedLocation?.locationCode);

        if (normalizedLocationCode) {
            setLocationCodePromptContext({
                orderId,
                commodity,
                selectedLocationId,
                location: selectedLocation
            });
            setLocationCodeEntry('');
            setLocationCodePromptError('');
            setLocationCodeBypassSeconds(5);
            setIsLocationCodeBypassReady(false);
            setLocationCodeScannerMessage('');
            setIsLocationCodePromptOpen(true);
            return;
        }

        await assignGroupToLocationInternal(orderId, commodity, selectedLocationId);
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

    useEffect(() => {
        if (!isLocationCodePromptOpen) {
            return undefined;
        }

        setLocationCodeBypassSeconds(5);
        setIsLocationCodeBypassReady(false);

        const intervalId = window.setInterval(() => {
            setLocationCodeBypassSeconds((current) => {
                if (current <= 1) {
                    window.clearInterval(intervalId);
                    setIsLocationCodeBypassReady(true);
                    return 0;
                }

                return current - 1;
            });
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [isLocationCodePromptOpen]);

    useEffect(() => {
        if (!isLocationCodeScannerOpen || !locationCodeScannerVideoRef.current || !locationCodeScannerStreamRef.current || !locationCodeScannerDetectorRef.current) {
            return undefined;
        }

        const video = locationCodeScannerVideoRef.current;
        video.srcObject = locationCodeScannerStreamRef.current;

        const startScanning = async () => {
            try {
                await video.play();
            } catch (error) {
                console.error('Unable to start location scanner preview', error);
                closeLocationCodeScanner();
                setLocationCodeScannerMessage('Camera unavailable');
                return;
            }

            const scan = async () => {
                if (!locationCodeScannerDetectorRef.current || !locationCodeScannerVideoRef.current || locationCodeScannerHandlingRef.current) {
                    locationCodeScannerFrameRef.current = window.requestAnimationFrame(scan);
                    return;
                }

                try {
                    const barcodes = await locationCodeScannerDetectorRef.current.detect(locationCodeScannerVideoRef.current);
                    if (Array.isArray(barcodes) && barcodes.length > 0) {
                        const rawValue = normalizeCodeValue(barcodes[0]?.rawValue);
                        if (rawValue) {
                            locationCodeScannerHandlingRef.current = true;
                            setLocationCodeEntry(rawValue);
                            closeLocationCodeScanner();
                            locationCodeScannerHandlingRef.current = false;
                            return;
                        }
                    }
                } catch (error) {
                    console.error('Location code scan failed', error);
                }

                locationCodeScannerFrameRef.current = window.requestAnimationFrame(scan);
            };

            locationCodeScannerFrameRef.current = window.requestAnimationFrame(scan);
        };

        startScanning();

        return () => {
            stopLocationCodeScannerSession();
        };
    // Effect depends on scanner modal state and refs controlled by helper methods.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLocationCodeScannerOpen]);

    useEffect(() => () => {
        stopLocationCodeScannerSession();
    }, []);

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
                                                Order {entry.order.orderNumber || `#${orderId}`} {'\u00B7'} Due {formatDueTime(entry.order.scheduledPickupTime)}
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
                                                                                {location.name}{location.locationCode ? ' [Locked]' : ''} ({Number(location.toteCount || 0)}/{Number(location.stagingLimit || 10)})
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

            {isLocationCodePromptOpen && locationCodePromptContext?.location ? (
                <div className="staging-code-modal-backdrop" role="presentation" onClick={closeLocationCodePrompt}>
                    <section className="staging-code-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Locked Location</h2>
                        <p>
                            {locationCodePromptContext.location.name} requires a location code before staging.
                        </p>
                        <input
                            type="text"
                            value={locationCodeEntry}
                            onChange={(event) => setLocationCodeEntry(event.target.value)}
                            placeholder="Scan or enter location code"
                            autoFocus
                        />
                        <div className="staging-code-modal-actions">
                            <button type="button" className="staging-action-btn" onClick={handleOpenLocationCodeScanner}>
                                Scan Code
                            </button>
                            <button type="button" className="staging-action-btn" onClick={handleLocationCodeSubmit}>
                                Verify
                            </button>
                            <button type="button" className="staging-action-btn staging-action-btn--danger" onClick={closeLocationCodePrompt}>
                                Cancel
                            </button>
                        </div>
                        {locationCodePromptError ? <p className="staging-code-modal-error">{locationCodePromptError}</p> : null}
                        {locationCodeScannerMessage ? <p className="staging-code-modal-error">{locationCodeScannerMessage}</p> : null}
                        {!isLocationCodeBypassReady ? (
                            <p className="staging-code-modal-help">Bypass available in {locationCodeBypassSeconds}s</p>
                        ) : (
                            <button type="button" className="staging-action-btn staging-action-btn--muted" onClick={handleLocationCodeBypass}>
                                Bypass Lock
                            </button>
                        )}
                    </section>
                </div>
            ) : null}

            {isLocationCodeScannerOpen ? (
                <div className="staging-code-modal-backdrop" role="presentation" onClick={closeLocationCodeScanner}>
                    <section className="staging-code-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Scan Location Code</h2>
                        <video ref={locationCodeScannerVideoRef} className="staging-code-scanner-video" autoPlay playsInline muted />
                        <div className="staging-code-modal-actions">
                            <button type="button" className="staging-action-btn staging-action-btn--danger" onClick={closeLocationCodeScanner}>
                                Close
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            <Navbar />
        </div>
    );
};

export default StagingPage;

