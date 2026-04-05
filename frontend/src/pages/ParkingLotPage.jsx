import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './ParkingLotPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const PARKING_SPACES_STORAGE_KEY = 'grocereParkingSpaces';
const WAIT_THRESHOLD_STORAGE_KEY = 'grocereWaitThresholdMinutes';
const MAX_SPACES = 200;

const getStoredSpaces = () => {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(PARKING_SPACES_STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }

        // Backward compatible migration from prior { id, name } objects to numeric spaces.
        const normalizedSpaces = parsed.map((space) => {
            if (typeof space === 'number') {
                return space;
            }

            if (space && typeof space === 'object') {
                return Number(space.id);
            }

            return Number.NaN;
        }).filter((spaceNumber) => Number.isInteger(spaceNumber) && spaceNumber >= 1 && spaceNumber <= MAX_SPACES);

        return Array.from(new Set(normalizedSpaces)).sort((left, right) => left - right);
    } catch {
        return [];
    }
};

const getStoredThreshold = () => {
    const threshold = Number(window.localStorage.getItem(WAIT_THRESHOLD_STORAGE_KEY));
    if (Number.isInteger(threshold) && threshold >= 1 && threshold <= 60) {
        return threshold;
    }

    return 5;
};

const ParkingLotPage = () => {
    const navigate = useNavigate();
    const [spaces, setSpaces] = useState(getStoredSpaces);
    const [orders, setOrders] = useState([]);
    const [sortMode, setSortMode] = useState('number');
    const [isLoading, setIsLoading] = useState(true);
    const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());
    const [spacePendingDelete, setSpacePendingDelete] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');

    const token = window.localStorage.getItem('authToken');
    const waitThresholdMinutes = getStoredThreshold();

    useEffect(() => {
        window.localStorage.setItem(PARKING_SPACES_STORAGE_KEY, JSON.stringify([...spaces].sort((left, right) => left - right)));
    }, [spaces]);

    useEffect(() => {
        const userType = window.localStorage.getItem('userType');
        if (!token || userType !== 'employee') {
            navigate('/');
        }
    }, [navigate, token]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setCurrentTimeTick(Date.now());
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, []);

    const loadOrders = useCallback(async () => {
        const response = await fetch(`${API_BASE}/api/orders`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Unable to load parking lot occupancy.');
        }

        const payload = await response.json();
        return Array.isArray(payload?.orders) ? payload.orders : [];
    }, [token]);

    const refreshOrders = useCallback(async () => {
        try {
            setErrorMessage('');
            setIsLoading(true);
            const orderRows = await loadOrders();
            setOrders(orderRows);
        } catch (error) {
            setErrorMessage(error.message || 'Unable to load parking lot occupancy.');
        } finally {
            setIsLoading(false);
        }
    }, [loadOrders]);

    useEffect(() => {
        refreshOrders();
    }, [refreshOrders]);

    const occupiedOrderBySpace = useMemo(() => {
        const map = new Map();
        const statusPriority = {
            dispensing: 0,
            ready: 1,
            staged: 2,
            staging: 3,
            picked: 4,
            picking: 5,
            assigned: 6,
            pending: 7
        };

        orders.forEach((order) => {
            const status = String(order?.status || '').toLowerCase();
            if (status === 'cancelled' || status === 'completed') {
                return;
            }

            const parkingSpotValue = Number(String(order?.parkingSpot || '').trim());
            if (!Number.isInteger(parkingSpotValue) || parkingSpotValue < 1 || parkingSpotValue > MAX_SPACES) {
                return;
            }

            const existing = map.get(parkingSpotValue);
            if (!existing) {
                map.set(parkingSpotValue, order);
                return;
            }

            const existingPriority = statusPriority[String(existing?.status || '').toLowerCase()] ?? 99;
            const candidatePriority = statusPriority[status] ?? 99;

            if (candidatePriority < existingPriority) {
                map.set(parkingSpotValue, order);
                return;
            }

            if (candidatePriority === existingPriority) {
                const existingDue = new Date(existing?.scheduledPickupTime || 0).getTime();
                const candidateDue = new Date(order?.scheduledPickupTime || 0).getTime();
                if (candidateDue < existingDue) {
                    map.set(parkingSpotValue, order);
                }
            }
        });

        return map;
    }, [orders]);

    const spacesWithOccupancy = useMemo(() => {
        return spaces.map((spaceNumber) => {
            const order = occupiedOrderBySpace.get(spaceNumber) || null;
            const checkInTime = order?.checkInTime;
            const waitSeconds = checkInTime ? Math.max(0, (currentTimeTick - new Date(checkInTime).getTime()) / 1000) : 0;

            return {
                number: spaceNumber,
                order,
                isOccupied: Boolean(order),
                waitSeconds
            };
        });
    }, [currentTimeTick, occupiedOrderBySpace, spaces]);

    const sortedSpaces = useMemo(() => {
        const rows = [...spacesWithOccupancy];

        if (sortMode === 'occupied-first') {
            return rows.sort((left, right) => {
                if (left.isOccupied !== right.isOccupied) {
                    return left.isOccupied ? -1 : 1;
                }

                return left.number - right.number;
            });
        }

        if (sortMode === 'high-wait-time') {
            return rows.sort((left, right) => {
                if (left.isOccupied !== right.isOccupied) {
                    return left.isOccupied ? -1 : 1;
                }

                if (left.isOccupied && right.isOccupied) {
                    const waitDiff = right.waitSeconds - left.waitSeconds;
                    if (waitDiff !== 0) {
                        return waitDiff;
                    }
                }

                return left.number - right.number;
            });
        }

        return rows.sort((left, right) => left.number - right.number);
    }, [sortMode, spacesWithOccupancy]);

    const getFirstAvailableSpaceNumber = (existingSpaces) => {
        const takenNumbers = new Set(existingSpaces);
        for (let number = 1; number <= MAX_SPACES; number += 1) {
            if (!takenNumbers.has(number)) {
                return number;
            }
        }

        return null;
    };

    const handleAddSpace = () => {
        const firstAvailable = getFirstAvailableSpaceNumber(spaces);
        if (!firstAvailable) {
            window.alert("You've hit your space limit.");
            return;
        }

        setSpaces((previous) => [...previous, firstAvailable].sort((left, right) => left - right));
    };

    const handleSpaceClick = (space) => {
        if (space.isOccupied && space.order) {
            navigate('/orders', {
                state: {
                    focusOrderId: space.order.id
                }
            });
            return;
        }

        setErrorMessage('');
        setSpacePendingDelete(space.number);
    };

    const confirmDeleteSpace = () => {
        if (!Number.isInteger(spacePendingDelete)) {
            return;
        }

        const isStillOccupied = occupiedOrderBySpace.has(spacePendingDelete);
        if (isStillOccupied) {
            setErrorMessage('Spaces may not be deleted while occupied.');
            setSpacePendingDelete(null);
            return;
        }

        setSpaces((previous) => previous.filter((spaceNumber) => spaceNumber !== spacePendingDelete));
        setSpacePendingDelete(null);
    };

    const getCustomerName = (order) => {
        const firstName = order?.customer?.firstName || '';
        const lastName = order?.customer?.lastName || '';
        return `${firstName} ${lastName}`.trim() || 'Customer';
    };

    const formatDueTime = (value) => {
        const dueDate = new Date(value);
        if (Number.isNaN(dueDate.getTime())) {
            return 'Due time unavailable';
        }

        return dueDate.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const formatWait = (waitSeconds) => {
        const safeSeconds = Math.max(0, Math.floor(waitSeconds));
        const minutes = Math.floor(safeSeconds / 60);
        const seconds = safeSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };

    const getStatusLabel = (order) => {
        const status = String(order?.status || '').toLowerCase();
        if (status === 'dispensing') {
            return 'DISPENSING IN PROGRESS';
        }

        if (status === 'ready') {
            return 'READY FOR PICKUP';
        }

        return String(order?.status || 'pending').toUpperCase();
    };

    return (
        <div className="parking-lot-page">
            <TopBar
                title="Parking Lot"
                theme="purple"
                leftActionLabel="<"
                leftActionAriaLabel="Back to orders"
                onLeftAction={() => navigate('/orders')}
            />

            <main className="parking-lot-content">
                <section className="parking-controls">
                    <button
                        type="button"
                        className="parking-control-btn"
                        onClick={handleAddSpace}
                    >
                        Add Space
                    </button>
                    <select className="parking-sort-select" value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                        <option value="number">Number</option>
                        <option value="occupied-first">Occupied first</option>
                        <option value="high-wait-time">High wait time</option>
                    </select>
                </section>

                {errorMessage ? <p className="parking-page-message parking-page-message--error">{errorMessage}</p> : null}
                {isLoading ? <p className="parking-page-message">Loading parking lot...</p> : null}

                {sortedSpaces.length === 0 ? (
                    <section className="parking-empty-state">
                        <h2>No parking spaces configured.</h2>
                        <p>Select New Space to begin.</p>
                    </section>
                ) : (
                    <section className="parking-space-list" aria-label="Parking spaces">
                        {sortedSpaces.map((space) => (
                            <article key={space.number} className={`parking-space-card${space.isOccupied ? ' parking-space-card--occupied' : ''}${space.waitSeconds >= waitThresholdMinutes * 60 ? ' parking-space-card--late' : ''}`}>
                                <button type="button" className="parking-space-main" onClick={() => handleSpaceClick(space)}>
                                    {space.isOccupied && space.order ? (
                                        <>
                                            <div className="parking-space-top-row">
                                                <span className="parking-space-customer">{getCustomerName(space.order)}</span>
                                                <span className="parking-space-status-pill">{getStatusLabel(space.order)}</span>
                                            </div>
                                            <p className="parking-space-order-id">Order {space.order.orderNumber || `#${space.order.id}`}</p>
                                            <div className="parking-space-bottom-row">
                                                <span>Due {formatDueTime(space.order.scheduledPickupTime)}</span>
                                                {space.waitSeconds > 0 ? (
                                                    <span className={`parking-space-wait${space.waitSeconds >= waitThresholdMinutes * 60 ? ' parking-space-wait--late' : ''}`}>
                                                        {formatWait(space.waitSeconds)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </>
                                    ) : (
                                        <span className="parking-space-empty-label">Empty</span>
                                    )}
                                    <span className="parking-space-number">
                                        <span className="parking-space-number-label">SPACE</span>
                                        <span className="parking-space-number-value">{space.number}</span>
                                    </span>
                                </button>
                            </article>
                        ))}
                    </section>
                )}
            </main>

            {Number.isInteger(spacePendingDelete) ? (
                <div className="parking-modal-backdrop" role="presentation" onClick={() => setSpacePendingDelete(null)}>
                    <section className="parking-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Delete Space {spacePendingDelete}?</h2>
                        <p className="parking-modal-copy">Do you want to delete this empty parking space?</p>
                        <div className="parking-modal-actions">
                            <button type="button" className="parking-modal-btn parking-modal-btn--ghost" onClick={() => setSpacePendingDelete(null)}>
                                Cancel
                            </button>
                            <button type="button" className="parking-modal-btn parking-modal-btn--danger" onClick={confirmDeleteSpace}>
                                Delete Space
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {sortedSpaces.length === 0 && !isLoading ? (
                <div className="parking-page-hint">
                    Add your first space to start assigning curbside parking spots.
                </div>
            ) : null}

            <Navbar />
        </div>
    );
};

export default ParkingLotPage;
