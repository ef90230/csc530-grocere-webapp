import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import ParkingSpaceDialog from '../components/common/ParkingSpaceDialog';
import OrderDetailModal from '../components/customer/OrderDetailModal';
import {
    collectOccupiedParkingSpaces,
    getParkingSpaceOptions,
    toParkingSpaceNumber
} from '../utils/parkingSpaces';
import './OrderListPage.css';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:5000');
const WAIT_THRESHOLD_STORAGE_KEY = 'grocereWaitThresholdMinutes';
const CANCEL_STATUS_TOAST_MESSAGE = 'Cannot cancel order in current status';
const CALL_APP_FAILURE_MESSAGE = 'Failed to reach phone app';
const TOAST_DURATION_MS = 5000;

const DEFAULT_WAIT_THRESHOLD_MINUTES = 5;

const ORDER_PHASE = {
    CANCELLED: 'cancelled',
    DISPENSING_IN_PROGRESS: 'dispensing_in_progress',
    READY_FOR_PICKUP: 'ready_for_pickup',
    STAGING_COMPLETE: 'staging_complete',
    STAGING_IN_PROGRESS: 'staging_in_progress',
    PICKING_COMPLETE: 'picking_complete',
    PICKING_IN_PROGRESS: 'picking_in_progress',
    PICKING_NOT_STARTED: 'picking_not_started',
    COMPLETED: 'completed'
};

const STATUS_LABELS = {
    [ORDER_PHASE.CANCELLED]: 'ORDER CANCELED',
    [ORDER_PHASE.PICKING_NOT_STARTED]: 'PICKING NOT STARTED',
    [ORDER_PHASE.PICKING_IN_PROGRESS]: 'PICKING IN PROGRESS',
    [ORDER_PHASE.STAGING_IN_PROGRESS]: 'STAGING IN PROGRESS',
    [ORDER_PHASE.STAGING_COMPLETE]: 'STAGING COMPLETE',
    [ORDER_PHASE.READY_FOR_PICKUP]: 'READY FOR PICKUP',
    [ORDER_PHASE.DISPENSING_IN_PROGRESS]: 'DISPENSING IN PROGRESS',
    [ORDER_PHASE.PICKING_COMPLETE]: 'PICKING COMPLETE',
    [ORDER_PHASE.COMPLETED]: 'ORDER COMPLETE'
};

const STATUS_SORT_WEIGHT = {
    [ORDER_PHASE.CANCELLED]: 9,
    [ORDER_PHASE.DISPENSING_IN_PROGRESS]: 1,
    [ORDER_PHASE.READY_FOR_PICKUP]: 2,
    [ORDER_PHASE.STAGING_COMPLETE]: 3,
    [ORDER_PHASE.STAGING_IN_PROGRESS]: 4,
    [ORDER_PHASE.PICKING_COMPLETE]: 5,
    [ORDER_PHASE.PICKING_IN_PROGRESS]: 6,
    [ORDER_PHASE.PICKING_NOT_STARTED]: 7,
    [ORDER_PHASE.COMPLETED]: 8
};

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getDialablePhone = (value) => String(value || '').replace(/[^0-9+]/g, '');

const getStoredThreshold = () => {
    const storedValue = Number(window.localStorage.getItem(WAIT_THRESHOLD_STORAGE_KEY));
    if (Number.isInteger(storedValue) && storedValue >= 1 && storedValue <= 60) {
        return storedValue;
    }

    return DEFAULT_WAIT_THRESHOLD_MINUTES;
};

const formatDueTime = (value) => {
    if (!value) {
        return 'Due time unavailable';
    }

    const dueTime = new Date(value);
    if (Number.isNaN(dueTime.getTime())) {
        return 'Due time unavailable';
    }

    return dueTime.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
    });
};

const formatTimer = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainingSeconds = safeSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const getTopOfCurrentHour = (dateInput = Date.now()) => {
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    date.setMinutes(0, 0, 0);
    return date;
};

const isExpiredTerminalOrder = (order, currentTime) => {
    const phase = order?.phase;
    if (phase !== ORDER_PHASE.COMPLETED && phase !== ORDER_PHASE.CANCELLED) {
        return false;
    }

    const topOfCurrentHour = getTopOfCurrentHour(currentTime);
    if (!topOfCurrentHour) {
        return false;
    }

    const updatedAt = new Date(order?.updatedAt || 0);
    if (Number.isNaN(updatedAt.getTime())) {
        return false;
    }

    return updatedAt < topOfCurrentHour;
};

const getCustomerName = (order) => {
    const firstName = order?.customer?.firstName || '';
    const lastName = order?.customer?.lastName || '';
    const resolvedName = `${firstName} ${lastName}`.trim();
    return resolvedName || 'Customer';
};

const getStagingCommodityForItem = (item) => {
    const normalizedTemperature = String(item?.item?.temperature || '').toLowerCase();

    if (normalizedTemperature === 'chilled' || normalizedTemperature === 'frozen' || normalizedTemperature === 'hot') {
        return normalizedTemperature;
    }

    return 'ambient';
};

const getOrderIdSortValue = (order) => {
    const parsedNumber = Number(String(order.orderNumber || '').replace(/[^0-9]/g, ''));
    if (Number.isFinite(parsedNumber) && parsedNumber > 0) {
        return parsedNumber;
    }

    return toNumber(order.id);
};

const deriveOrderPhase = (order, stagedToteCountByOrderId) => {
    const status = String(order.status || '').toLowerCase();
    const scheduledPickupTime = order?.scheduledPickupTime ? new Date(order.scheduledPickupTime) : null;
    const hasReachedTimeslot = Boolean(
        scheduledPickupTime
        && !Number.isNaN(scheduledPickupTime.getTime())
        && new Date() >= scheduledPickupTime
    );

    if (status === 'cancelled') {
        return ORDER_PHASE.CANCELLED;
    }

    if (status === 'dispensing') {
        return ORDER_PHASE.DISPENSING_IN_PROGRESS;
    }

    if (status === 'completed') {
        return ORDER_PHASE.COMPLETED;
    }

    const orderItems = Array.isArray(order.items) ? order.items : [];
    const pickedItems = orderItems.reduce((sum, item) => {
        const pickedQuantity = toNumber(item.pickedQuantity);
        if (pickedQuantity > 0) {
            return sum + pickedQuantity;
        }

        if (item.status === 'found' || item.status === 'substituted') {
            return sum + toNumber(item.quantity);
        }

        return sum;
    }, 0);

    const commoditySet = new Set(
        orderItems
            .map((item) => getStagingCommodityForItem(item))
            .filter(Boolean)
    );
    const totalTotes = commoditySet.size;
    const stagedTotes = toNumber(stagedToteCountByOrderId.get(order.id));
    const allTotesStaged = totalTotes > 0 && stagedTotes >= totalTotes;
    const isExplicitStagedStatus = status === 'staged' || status === 'staging_complete' || status === 'ready' || status === 'ready_for_pickup';
    const isFullyStaged = allTotesStaged || isExplicitStagedStatus;

    if (isFullyStaged) {
        return hasReachedTimeslot ? ORDER_PHASE.READY_FOR_PICKUP : ORDER_PHASE.STAGING_COMPLETE;
    }

    if (status === 'staging' || status === 'staged') {
        return ORDER_PHASE.STAGING_IN_PROGRESS;
    }

    if (status === 'picked') {
        return ORDER_PHASE.PICKING_COMPLETE;
    }

    if (status === 'picking' || pickedItems > 0) {
        return ORDER_PHASE.PICKING_IN_PROGRESS;
    }

    if (status === 'pending' || status === 'assigned') {
        return ORDER_PHASE.PICKING_NOT_STARTED;
    }

    return ORDER_PHASE.PICKING_NOT_STARTED;
};

const isCardInteractive = (order) => order?.phase !== ORDER_PHASE.COMPLETED && order?.phase !== ORDER_PHASE.CANCELLED;

const OrderListPage = () => {
    const navigate = useNavigate();
    const routeLocation = useLocation();
    const [orders, setOrders] = useState([]);
    const [stagingAssignments, setStagingAssignments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [sortMode, setSortMode] = useState('status');
    const [waitThresholdMinutes, setWaitThresholdMinutes] = useState(getStoredThreshold);
    const [waitThresholdDraft, setWaitThresholdDraft] = useState(String(getStoredThreshold()));
    const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
    const [isThresholdSaving, setIsThresholdSaving] = useState(false);
    const [activeOrder, setActiveOrder] = useState(null);
    const [detailOrder, setDetailOrder] = useState(null);
    const [isOrderOptionsModalOpen, setIsOrderOptionsModalOpen] = useState(false);
    const [isParkingDialogOpen, setIsParkingDialogOpen] = useState(false);
    const [parkingDialogOrder, setParkingDialogOrder] = useState(null);
    const [selectedParkingSpace, setSelectedParkingSpace] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());
    const [highlightedOrderId, setHighlightedOrderId] = useState(null);
    const [bottomToastMessage, setBottomToastMessage] = useState('');

    const token = window.localStorage.getItem('authToken');
    const userType = window.localStorage.getItem('userType');
    const isAdmin = userType === 'admin';

    useEffect(() => {
        const userType = window.localStorage.getItem('userType');
        if (!token || (userType !== 'employee' && userType !== 'admin')) {
            navigate('/');
        }
    }, [navigate, token]);

    const loadOrders = useCallback(async () => {
        const response = await fetch(`${API_BASE}/api/orders`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Unable to load orders.');
        }

        const payload = await response.json();
        return Array.isArray(payload?.orders) ? payload.orders : [];
    }, [token]);

    const loadAssignments = useCallback(async () => {
        const response = await fetch(`${API_BASE}/api/staging-locations/assignments`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return [];
        }

        const payload = await response.json();
        return Array.isArray(payload?.assignments) ? payload.assignments : [];
    }, [token]);

    const refreshOrders = useCallback(async () => {
        setIsLoading(true);
        try {
            setErrorMessage('');
            const [orderRows, assignmentRows] = await Promise.all([loadOrders(), loadAssignments()]);
            setOrders(orderRows);
            setStagingAssignments(assignmentRows);
        } catch (error) {
            setErrorMessage(error.message || 'Unable to load orders.');
        } finally {
            setIsLoading(false);
        }
    }, [loadAssignments, loadOrders]);

    useEffect(() => {
        refreshOrders();
    }, [refreshOrders]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setCurrentTimeTick(Date.now());
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (!bottomToastMessage) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            setBottomToastMessage('');
        }, TOAST_DURATION_MS);

        return () => window.clearTimeout(timeoutId);
    }, [bottomToastMessage]);

    const stagedToteCountByOrderId = useMemo(() => {
        const counts = new Map();
        stagingAssignments.forEach((assignment) => {
            const orderId = toNumber(assignment.orderId);
            counts.set(orderId, (counts.get(orderId) || 0) + 1);
        });
        return counts;
    }, [stagingAssignments]);

    const mappedOrders = useMemo(() => {
        return orders.map((order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const totalItems = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
            const pickedItems = items.reduce((sum, item) => {
                const pickedQuantity = toNumber(item.pickedQuantity);
                if (pickedQuantity > 0) {
                    return sum + pickedQuantity;
                }

                if (item.status === 'found' || item.status === 'substituted') {
                    return sum + toNumber(item.quantity);
                }

                return sum;
            }, 0);

            const commoditySet = new Set(
                items
                    .map((item) => getStagingCommodityForItem(item))
                    .filter(Boolean)
            );

            const totalTotes = commoditySet.size;
            const stagedTotes = toNumber(stagedToteCountByOrderId.get(order.id));
            const phase = deriveOrderPhase(order, stagedToteCountByOrderId);
            const customerName = getCustomerName(order);
            const parkingSpot = String(order?.parkingSpot || '').trim();
            const checkInTime = order?.checkInTime;
            const isCheckedIn = Boolean(order?.isCheckedIn);
            const hasWaitTimer = phase === ORDER_PHASE.DISPENSING_IN_PROGRESS && isCheckedIn && Boolean(parkingSpot) && Boolean(checkInTime);
            const waitSeconds = hasWaitTimer ? Math.max(0, (currentTimeTick - new Date(checkInTime).getTime()) / 1000) : 0;
            const isPastThreshold = waitSeconds >= waitThresholdMinutes * 60;

            return {
                ...order,
                phase,
                customerName,
                totalItems,
                pickedItems,
                totalTotes,
                stagedTotes,
                parkingSpot,
                hasWaitTimer,
                waitSeconds,
                isPastThreshold
            };
        });
    }, [currentTimeTick, orders, stagedToteCountByOrderId, waitThresholdMinutes]);

    const sortedOrders = useMemo(() => {
        const rows = mappedOrders.filter((order) => !isExpiredTerminalOrder(order, currentTimeTick));

        if (sortMode === 'order-id') {
            return rows.sort((left, right) => getOrderIdSortValue(left) - getOrderIdSortValue(right));
        }

        if (sortMode === 'due-time') {
            return rows.sort((left, right) => new Date(left.scheduledPickupTime).getTime() - new Date(right.scheduledPickupTime).getTime());
        }

        if (sortMode === 'customer-name') {
            return rows.sort((left, right) => left.customerName.localeCompare(right.customerName));
        }

        return rows.sort((left, right) => {
            const statusWeightDiff = STATUS_SORT_WEIGHT[left.phase] - STATUS_SORT_WEIGHT[right.phase];
            if (statusWeightDiff !== 0) {
                return statusWeightDiff;
            }

            const dueTimeDiff = new Date(left.scheduledPickupTime).getTime() - new Date(right.scheduledPickupTime).getTime();
            if (dueTimeDiff !== 0) {
                return dueTimeDiff;
            }

            return left.customerName.localeCompare(right.customerName);
        });
    }, [currentTimeTick, mappedOrders, sortMode]);

    useEffect(() => {
        const focusOrderId = Number(routeLocation?.state?.focusOrderId);
        if (!Number.isInteger(focusOrderId)) {
            return;
        }

        const hasOrder = sortedOrders.some((order) => order.id === focusOrderId);
        if (!hasOrder) {
            return;
        }

        setHighlightedOrderId(focusOrderId);
        window.setTimeout(() => {
            const target = document.getElementById(`order-card-${focusOrderId}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 90);

        const clearHighlightTimeout = window.setTimeout(() => {
            setHighlightedOrderId(null);
        }, 2200);

        navigate('/orders', { replace: true, state: {} });

        return () => window.clearTimeout(clearHighlightTimeout);
    }, [navigate, routeLocation?.state, sortedOrders]);

    const closeOrderOptionsModal = () => {
        setIsOrderOptionsModalOpen(false);
        setActiveOrder(null);
    };

    const openOrderOptions = (order) => {
        setActiveOrder(order);
        setErrorMessage('');
        setIsOrderOptionsModalOpen(true);
    };

    const handleOpenOrderDetails = (order) => {
        if (!order) {
            return;
        }

        setDetailOrder(order);
        setIsOrderOptionsModalOpen(false);
    };

    const handleOrderUpdated = (updatedOrder) => {
        if (!updatedOrder?.id) {
            return;
        }

        const mergeOrder = (order) => ({
            ...order,
            ...updatedOrder,
            customer: updatedOrder.customer || order.customer,
            items: Array.isArray(updatedOrder.items) ? updatedOrder.items : order.items
        });

        setOrders((previous) => previous.map((order) => (
            order.id === updatedOrder.id ? mergeOrder(order) : order
        )));

        setActiveOrder((previous) => (
            previous?.id === updatedOrder.id ? mergeOrder(previous) : previous
        ));

        setDetailOrder((previous) => (
            previous?.id === updatedOrder.id ? mergeOrder(previous) : previous
        ));
    };

    const openParkingDialog = (order) => {
        setParkingDialogOrder(order);
        setSelectedParkingSpace(toParkingSpaceNumber(order.parkingSpot));
        setErrorMessage('');
        setIsParkingDialogOpen(true);
    };

    const closeParkingDialog = () => {
        setIsParkingDialogOpen(false);
        setParkingDialogOrder(null);
        setSelectedParkingSpace(null);
    };

    const occupiedParkingSpaceSet = useMemo(() => {
        return collectOccupiedParkingSpaces(mappedOrders, parkingDialogOrder?.id);
    }, [mappedOrders, parkingDialogOrder?.id]);

    const availableParkingSpaces = useMemo(() => {
        const currentParkingSpace = toParkingSpaceNumber(selectedParkingSpace);

        return getParkingSpaceOptions({
            occupiedSpaces: Array.from(occupiedParkingSpaceSet),
            includeSpaces: currentParkingSpace ? [currentParkingSpace] : []
        });
    }, [occupiedParkingSpaceSet, selectedParkingSpace]);

    const setParkingSpaceAndCheckIn = async (order, parkingSpotValue) => {
        if (!order?.customer?.id) {
            throw new Error('Unable to find customer for this order.');
        }

        const response = await fetch(`${API_BASE}/api/customers/${order.customer.id}/checkin`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                orderId: order.id,
                parkingSpot: parkingSpotValue
            })
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Unable to set parking space.');
        }

        const statusResponse = await fetch(`${API_BASE}/api/orders/${order.id}/status`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'dispensing' })
        });

        if (!statusResponse.ok) {
            const payload = await statusResponse.json().catch(() => ({}));
            throw new Error(payload.message || 'Unable to update order status.');
        }
    };

    const handleSaveParkingSpace = async () => {
        if (!parkingDialogOrder) {
            return;
        }

        if (!selectedParkingSpace) {
            setErrorMessage('Parking space is required.');
            return;
        }

        setIsSubmitting(true);
        setErrorMessage('');

        try {
            await setParkingSpaceAndCheckIn(parkingDialogOrder, String(selectedParkingSpace));
            await refreshOrders();
            closeParkingDialog();
        } catch (error) {
            setErrorMessage(error.message || 'Unable to set parking space.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStartDispense = async (order) => {
        if (!order?.id) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/orders/${order.id}/status`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'dispensing' })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to start dispensing process.');
            }

            closeOrderOptionsModal();
            navigate('/dispense', {
                state: {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    customerName: order.customerName,
                    parkingSpot: order.parkingSpot
                }
            });
        } catch (error) {
            setErrorMessage(error.message || 'Unable to start dispensing process.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancelOrder = async () => {
        if (!activeOrder?.id) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/orders/${activeOrder.id}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to cancel order.');
            }

            setIsCancelDialogOpen(false);
            closeOrderOptionsModal();
            await refreshOrders();
        } catch (error) {
            const resolvedMessage = error.message || 'Unable to cancel order.';

            if (resolvedMessage === CANCEL_STATUS_TOAST_MESSAGE) {
                setBottomToastMessage(resolvedMessage);
                setErrorMessage('');
                setIsCancelDialogOpen(false);
            } else {
                setErrorMessage(resolvedMessage);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCallCustomer = (order) => {
        const phoneNumber = getDialablePhone(order?.customer?.phone);
        if (!phoneNumber) {
            setErrorMessage(CALL_APP_FAILURE_MESSAGE);
            return;
        }

        try {
            window.location.href = `tel:${phoneNumber}`;
        } catch {
            setErrorMessage(CALL_APP_FAILURE_MESSAGE);
        }
    };

    const handleSaveThreshold = (event) => {
        event.preventDefault();
        const parsedValue = Number(waitThresholdDraft);
        if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 60) {
            setErrorMessage('Wait time threshold must be a whole number from 1 to 60 minutes.');
            return;
        }

        setIsThresholdSaving(true);
        setErrorMessage('');

        window.localStorage.setItem(WAIT_THRESHOLD_STORAGE_KEY, String(parsedValue));
        setWaitThresholdMinutes(parsedValue);
        setIsThresholdModalOpen(false);
        setIsThresholdSaving(false);
    };

    const handleShortcutClick = (event, order) => {
        event.stopPropagation();

        if (order.phase === ORDER_PHASE.PICKING_NOT_STARTED) {
            navigate('/commodityselect');
            return;
        }

        if (order.phase === ORDER_PHASE.PICKING_IN_PROGRESS || order.phase === ORDER_PHASE.CANCELLED) {
            openOrderOptions(order);
            return;
        }

        if (order.phase === ORDER_PHASE.STAGING_IN_PROGRESS) {
            navigate('/staging', {
                state: {
                    focusOrderId: order.id
                }
            });
            return;
        }

        if (order.phase === ORDER_PHASE.READY_FOR_PICKUP) {
            openParkingDialog(order);
            return;
        }

        openOrderOptions(order);
    };

    const getProgressText = (order) => {
        if (order.phase === ORDER_PHASE.PICKING_NOT_STARTED) {
            return `0/${order.totalItems} items`;
        }

        if (order.phase === ORDER_PHASE.PICKING_IN_PROGRESS) {
            return `${Math.min(order.pickedItems, order.totalItems)}/${order.totalItems} items`;
        }

        if (order.phase === ORDER_PHASE.STAGING_IN_PROGRESS || order.phase === ORDER_PHASE.READY_FOR_PICKUP || order.phase === ORDER_PHASE.DISPENSING_IN_PROGRESS) {
            return `${Math.min(order.stagedTotes, order.totalTotes)}/${order.totalTotes} totes`;
        }

        return `${Math.min(order.pickedItems, order.totalItems)}/${order.totalItems} items`;
    };

    const getShortcutLabel = (order) => {
        if (order.phase === ORDER_PHASE.PICKING_NOT_STARTED) {
            return 'PICKING';
        }

        if (order.phase === ORDER_PHASE.PICKING_IN_PROGRESS || order.phase === ORDER_PHASE.CANCELLED) {
            return 'OPTIONS';
        }

        if (order.phase === ORDER_PHASE.STAGING_IN_PROGRESS) {
            return 'STAGING INFO';
        }

        if (order.phase === ORDER_PHASE.READY_FOR_PICKUP) {
            return 'CHECK IN';
        }

        if (order.phase === ORDER_PHASE.DISPENSING_IN_PROGRESS) {
            return 'PREPARE THE ORDER';
        }

        return 'OPTIONS';
    };

    return (
        <div className="order-list-page">
            <TopBar title="Orders and Dispensing" theme="purple" />
            <main className="order-list-content">
                <section className="order-list-controls">
                    <button type="button" className="order-list-control-btn" onClick={() => navigate('/parking-lot')}>
                        Lot Info
                    </button>
                    {isAdmin ? (
                        <button
                            type="button"
                            className="order-list-control-btn"
                            onClick={() => {
                                setErrorMessage('');
                                setWaitThresholdDraft(String(waitThresholdMinutes));
                                setIsThresholdModalOpen(true);
                            }}
                        >
                            Options
                        </button>
                    ) : null}
                    <select className="order-list-sort-select" value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                        <option value="status">Status</option>
                        <option value="order-id">Order ID</option>
                        <option value="due-time">Due time</option>
                        <option value="customer-name">Customer name</option>
                    </select>
                </section>

                {isLoading ? <p className="order-list-message">Loading orders...</p> : null}
                {!isLoading && errorMessage ? <p className="order-list-message order-list-message--error">{errorMessage}</p> : null}

                {!isLoading ? (
                    <section className="order-list-queue" aria-label="Orders queue">
                        {sortedOrders.map((order) => (
                            <article
                                key={order.id}
                                id={`order-card-${order.id}`}
                                className={`order-card order-card--${order.phase}${order.isPastThreshold ? ' order-card--threshold' : ''}${highlightedOrderId === order.id ? ' order-card--focus' : ''}`}
                                onClick={() => {
                                    if (!isCardInteractive(order)) {
                                        return;
                                    }
                                    openOrderOptions(order);
                                }}
                                role="button"
                                tabIndex={isCardInteractive(order) ? 0 : -1}
                                onKeyDown={(event) => {
                                    if (!isCardInteractive(order)) {
                                        return;
                                    }
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        openOrderOptions(order);
                                    }
                                }}
                            >
                                <div className="order-card-status-row">
                                    <span className={`order-card-status-pill order-card-status-pill--${order.phase}`}>{STATUS_LABELS[order.phase]}</span>
                                </div>

                                <div className="order-card-main-row">
                                    <div>
                                        <p className="order-card-name">{order.customerName}</p>
                                        <p className="order-card-id">Order {order.orderNumber || `#${order.id}`}</p>
                                    </div>
                                    {(order.phase === ORDER_PHASE.READY_FOR_PICKUP || order.phase === ORDER_PHASE.DISPENSING_IN_PROGRESS) ? (
                                        <p className="order-card-space">SPACE {order.parkingSpot || '?'}</p>
                                    ) : null}
                                </div>

                                <div className="order-card-bottom-row">
                                    <div className="order-card-details-left">
                                        <p>{getProgressText(order)}</p>
                                        <p>Due {formatDueTime(order.scheduledPickupTime)}</p>
                                        {order.hasWaitTimer ? (
                                            <span className={`order-wait-timer${order.isPastThreshold ? ' order-wait-timer--late' : ''}`}>
                                                {formatTimer(order.waitSeconds)}
                                            </span>
                                        ) : null}
                                    </div>

                                    {order.phase !== ORDER_PHASE.COMPLETED && order.phase !== ORDER_PHASE.CANCELLED ? (
                                        <button
                                            type="button"
                                            className="order-shortcut-btn"
                                            onClick={(event) => handleShortcutClick(event, order)}
                                        >
                                            <span>{getShortcutLabel(order)}</span>
                                            <span className="order-shortcut-arrow">&gt;</span>
                                        </button>
                                    ) : null}
                                </div>
                            </article>
                        ))}

                        {sortedOrders.length === 0 ? (
                            <p className="order-list-message">No orders found for this queue.</p>
                        ) : null}
                    </section>
                ) : null}
            </main>

            {bottomToastMessage ? (
                <div className="order-list-toast" role="status" aria-live="polite">
                    {bottomToastMessage}
                </div>
            ) : null}

            {isThresholdModalOpen ? (
                <div className="order-modal-backdrop" role="presentation" onClick={() => setIsThresholdModalOpen(false)}>
                    <section className="order-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Queue Options</h2>
                        <form className="order-modal-form" onSubmit={handleSaveThreshold}>
                            <label htmlFor="wait-threshold-input">Wait time warning threshold (minutes)</label>
                            <input
                                id="wait-threshold-input"
                                type="number"
                                value={waitThresholdDraft}
                                min={1}
                                max={60}
                                required
                                onChange={(event) => setWaitThresholdDraft(event.target.value)}
                            />
                            <div className="order-modal-actions">
                                <button type="button" className="order-modal-btn order-modal-btn--ghost" onClick={() => setIsThresholdModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="order-modal-btn order-modal-btn--primary" disabled={isThresholdSaving}>
                                    {isThresholdSaving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            ) : null}

            {detailOrder ? (
                <OrderDetailModal
                    order={detailOrder}
                    onClose={() => setDetailOrder(null)}
                    onOrderUpdated={handleOrderUpdated}
                />
            ) : null}

            {isOrderOptionsModalOpen && activeOrder ? (
                <div className="order-modal-backdrop" role="presentation" onClick={closeOrderOptionsModal}>
                    <section className="order-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>{activeOrder.customerName}</h2>
                        <p className="order-modal-subtitle">Order {activeOrder.orderNumber || `#${activeOrder.id}`}</p>

                        <div className="order-modal-action-stack">
                            <button
                                type="button"
                                className="order-modal-btn order-modal-btn--primary"
                                disabled={activeOrder.phase !== ORDER_PHASE.READY_FOR_PICKUP || isSubmitting}
                                onClick={() => openParkingDialog(activeOrder)}
                            >
                                Set Parking Space and Check In
                            </button>

                            <button
                                type="button"
                                className="order-modal-btn order-modal-btn--primary"
                                disabled={!activeOrder.parkingSpot || isSubmitting}
                                onClick={() => handleStartDispense(activeOrder)}
                            >
                                Prep and Dispense Order
                            </button>

                            <button
                                type="button"
                                className="order-modal-btn order-modal-btn--primary"
                                disabled={isSubmitting}
                                onClick={() => handleOpenOrderDetails(activeOrder)}
                            >
                                Show Item Details
                            </button>

                            <button
                                type="button"
                                className="order-modal-btn order-modal-btn--primary"
                                disabled={isSubmitting}
                                onClick={() => handleCallCustomer(activeOrder)}
                            >
                                Call Customer
                            </button>

                            <button
                                type="button"
                                className="order-modal-btn order-modal-btn--danger"
                                disabled={isSubmitting}
                                onClick={() => setIsCancelDialogOpen(true)}
                            >
                                Cancel Order
                            </button>
                        </div>

                        <div className="order-modal-actions">
                            <button type="button" className="order-modal-btn order-modal-btn--ghost" onClick={closeOrderOptionsModal}>
                                Close
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {isParkingDialogOpen && parkingDialogOrder ? (
                <ParkingSpaceDialog
                    title={`Order ${parkingDialogOrder.orderNumber || `#${parkingDialogOrder.id}`}`}
                    subtitle={null}
                    promptText="Select the space the customer is parked in."
                    spaces={availableParkingSpaces}
                    occupiedSpaceSet={occupiedParkingSpaceSet}
                    selectedSpace={selectedParkingSpace}
                    onSelectSpace={(spaceNumber) => {
                        if (occupiedParkingSpaceSet.has(Number(spaceNumber)) && Number(selectedParkingSpace) !== Number(spaceNumber)) {
                            return;
                        }
                        setSelectedParkingSpace(Number(spaceNumber));
                    }}
                    onClose={closeParkingDialog}
                    onConfirm={handleSaveParkingSpace}
                    isSubmitting={isSubmitting}
                    confirmLabel="Set"
                />
            ) : null}

            {isCancelDialogOpen ? (
                <div className="order-modal-backdrop" role="presentation" onClick={() => setIsCancelDialogOpen(false)}>
                    <section className="order-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Cancel Order</h2>
                        <p className="order-warning-copy">
                            Are you really sure you want to cancel this order? The customer will be notified and refunded. Any staged or picked items should be returned or claimed following your store's process. Employees should not take this action unless a member of management authorizes them.
                        </p>
                        <div className="order-modal-actions">
                            <button type="button" className="order-modal-btn order-modal-btn--ghost" onClick={() => setIsCancelDialogOpen(false)}>
                                Keep Order
                            </button>
                            <button type="button" className="order-modal-btn order-modal-btn--danger" disabled={isSubmitting} onClick={handleCancelOrder}>
                                {isSubmitting ? 'Cancelling...' : 'Cancel Order'}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            <Navbar />
        </div>
    );
};

export default OrderListPage;

