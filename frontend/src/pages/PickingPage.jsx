import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from '../components/common/TopBar';
import './PickingPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const toCurrency = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '$0.00';
    }

    return `$${numeric.toFixed(2)}`;
};

const deriveCommodityTitle = (label = '') => {
    const normalized = String(label || '').trim();
    if (!normalized) {
        return 'Commodity';
    }

    return normalized.replace(/\s+Regular$/i, '');
};

const formatLocationLabel = (location) => {
    if (!location) {
        return 'Location unavailable';
    }

    const aisle = location.aisleNumber || '—';
    const section = location.section ? ` • Section ${location.section}` : '';
    return `Aisle ${aisle}${section}`;
};

const PickingPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [storeId, setStoreId] = useState(null);
    const [queue, setQueue] = useState([]);
    const [aisles, setAisles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [isEndPromptOpen, setIsEndPromptOpen] = useState(false);
    const [isEndingWalk, setIsEndingWalk] = useState(false);
    const [walkStartedAt, setWalkStartedAt] = useState(null);
    // substituteMode is null (normal) or { originalEntry } when showing a substitute item
    const [substituteMode, setSubstituteMode] = useState(null);
    const [completedUnits, setCompletedUnits] = useState(0);
    const [isPickDialogOpen, setIsPickDialogOpen] = useState(false);
    const [pickUpcValue, setPickUpcValue] = useState('');
    const [pickQtyValue, setPickQtyValue] = useState('');
    const [pickDialogError, setPickDialogError] = useState('');
    const [isSubmittingPick, setIsSubmittingPick] = useState(false);
    const [isPickUpcMismatch, setIsPickUpcMismatch] = useState(false);

    const selectedCommodity = location?.state?.commodity;
    const selectedCommodityLabel = location?.state?.commodityLabel;

    useEffect(() => {
        const token = window.localStorage.getItem('authToken');
        const userType = window.localStorage.getItem('userType');

        if (!token || userType !== 'employee') {
            navigate('/');
            return undefined;
        }

        if (!selectedCommodity) {
            navigate('/commodityselect');
            return undefined;
        }

        const controller = new AbortController();

        const loadWalk = async () => {
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
                const resolvedStoreId = profilePayload?.user?.storeId;

                if (!resolvedStoreId) {
                    throw new Error('No store is assigned to this employee.');
                }

                setStoreId(resolvedStoreId);

                const [walkResponse, aislesResponse] = await Promise.all([
                    fetch(`${API_BASE}/api/orders/picking/walk/start`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            storeId: resolvedStoreId,
                            commodity: selectedCommodity
                        }),
                        signal: controller.signal
                    }),
                    fetch(`${API_BASE}/api/aisles/store/${resolvedStoreId}`, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        },
                        signal: controller.signal
                    })
                ]);

                if (!walkResponse.ok) {
                    throw new Error('Unable to start pick walk for the selected commodity.');
                }

                const walkPayload = await walkResponse.json();
                const resolvedQueue = Array.isArray(walkPayload?.queue) ? walkPayload.queue : [];
                setQueue(resolvedQueue);
                setWalkStartedAt(new Date().toISOString());

                if (aislesResponse.ok) {
                    const aislesPayload = await aislesResponse.json().catch(() => ({}));
                    setAisles(Array.isArray(aislesPayload?.aisles) ? aislesPayload.aisles : []);
                } else {
                    setAisles([]);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Unable to load pick walk', error);
                    setErrorMessage(error.message || 'Unable to load pick walk.');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        loadWalk();

        return () => controller.abort();
    }, [navigate, selectedCommodity]);

    const remainingUnits = useMemo(() => (
        queue.reduce((sum, row) => sum + Number(row?.quantityToPick || 0), 0)
    ), [queue]);
    const totalUnits = completedUnits + remainingUnits;

    const currentItem = queue[0] || null;
    const currentQuantity = Number(currentItem?.quantityToPick || 0);
    const commodityTitle = useMemo(() => {
        const fallback = deriveCommodityTitle(selectedCommodity || 'Commodity');
        return deriveCommodityTitle(selectedCommodityLabel || fallback);
    }, [selectedCommodity, selectedCommodityLabel]);

    const skipCurrentItem = () => {
        if (substituteMode) {
            // In substitute mode: exit substitute view, move original item to back of queue
            setSubstituteMode(null);
            setQueue((previousQueue) => {
                if (!Array.isArray(previousQueue) || previousQueue.length <= 1) {
                    return previousQueue;
                }
                const [firstItem, ...remainingItems] = previousQueue;
                return [...remainingItems, firstItem];
            });
            return;
        }
        setQueue((previousQueue) => {
            if (!Array.isArray(previousQueue) || previousQueue.length <= 1) {
                return previousQueue;
            }
            const [firstItem, ...remainingItems] = previousQueue;
            return [...remainingItems, firstItem];
        });
    };

    const handleOriginalItemLocated = () => {
        setSubstituteMode(null);
    };

    const handleNotFound = () => {
        if (substituteMode) {
            // Sub item not found: remove the original item entirely and exit substitute mode
            setSubstituteMode(null);
            setQueue((previousQueue) => {
                const remaining = previousQueue.slice(1);
                if (remaining.length === 0) {
                    endWalk();
                }
                return remaining;
            });
            return;
        }

        const item = queue[0];
        if (!item) {
            return;
        }

        if (item.substitute) {
            // Has a substitute: enter substitute mode
            setSubstituteMode({ originalEntry: item });
            return;
        }

        // No substitute: remove item and advance
        setQueue((previousQueue) => {
            const remaining = previousQueue.slice(1);
            if (remaining.length === 0) {
                endWalk();
            }
            return remaining;
        });
    };

    const handlePickSubmit = async () => {
        const trimmedUpc = pickUpcValue.trim();
        const parsedQty = Number(pickQtyValue.trim());
        const expectedUpc = substituteMode
            ? (substituteMode.originalEntry.substitute?.upc || '')
            : (currentItem?.item?.upc || '');

        if (!trimmedUpc) {
            setPickDialogError('UPC is required.');
            return;
        }
        if (!pickQtyValue.trim()) {
            setPickDialogError('Quantity is required.');
            return;
        }
        if (!Number.isInteger(parsedQty) || parsedQty < 1) {
            setPickDialogError('Quantity must be a whole number of at least 1.');
            return;
        }
        if (parsedQty > currentQuantity) {
            setPickDialogError(`Quantity cannot exceed ${currentQuantity}.`);
            return;
        }

        setPickDialogError('');

        if (trimmedUpc !== expectedUpc) {
            setIsPickDialogOpen(false);
            setIsPickUpcMismatch(true);
            return;
        }

        const token = window.localStorage.getItem('authToken');
        setIsSubmittingPick(true);

        try {
            const locationId = substituteMode ? null : (currentItem.location?.locationId || null);
            const response = await fetch(`${API_BASE}/api/orders/picking/walk/record-pick`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderId: currentItem.orderId,
                    orderItemId: currentItem.orderItemId,
                    pickedQuantity: parsedQty,
                    locationId
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                setPickDialogError(payload.message || 'Server error recording pick.');
                return;
            }

            setCompletedUnits((prev) => prev + parsedQty);
            setIsPickDialogOpen(false);
            setPickUpcValue('');
            setPickQtyValue('');

            const newQty = currentQuantity - parsedQty;
            if (newQty <= 0) {
                setSubstituteMode(null);
                if (queue.length === 1) {
                    await endWalk();
                    return;
                }
                setQueue((prev) => prev.slice(1));
            } else {
                setQueue((prev) => {
                    if (!prev.length) {
                        return prev;
                    }
                    const [head, ...rest] = prev;
                    const updatedOnHandByAisle = { ...head.onHandByAisle };
                    const primaryAisle = head.location?.aisleNumber;
                    if (primaryAisle) {
                        const aisleKey = `Aisle ${primaryAisle}`;
                        updatedOnHandByAisle[aisleKey] = Math.max(0, (updatedOnHandByAisle[aisleKey] || 0) - parsedQty);
                    }
                    return [
                        {
                            ...head,
                            quantityToPick: newQty,
                            onHandTotal: Math.max(0, Number(head.onHandTotal || 0) - parsedQty),
                            onHandByAisle: updatedOnHandByAisle
                        },
                        ...rest
                    ];
                });
            }
        } catch (err) {
            console.error('Record pick failed', err);
            setPickDialogError('Network error. Please try again.');
        } finally {
            setIsSubmittingPick(false);
        }
    };

    const endWalk = async () => {
        const token = window.localStorage.getItem('authToken');
        if (!token || !storeId || !selectedCommodity) {
            navigate('/commodityselect');
            return;
        }

        setIsEndingWalk(true);

        try {
            await fetch(`${API_BASE}/api/orders/picking/walk/end`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    storeId,
                    commodity: selectedCommodity
                })
            });
        } catch (error) {
            console.error('Unable to end walk cleanly', error);
        } finally {
            navigate('/commodityselect');
        }
    };

    return (
        <div className="picking-page">
            <TopBar
                title={`${commodityTitle} Picking`}
                leftActionLabel="×"
                leftActionAriaLabel="End pick walk"
                onLeftAction={() => setIsEndPromptOpen(true)}
                statMode="walk"
                walkCompletedUnits={completedUnits}
                walkTotalUnits={totalUnits}
                walkStartedAt={walkStartedAt}
            />

            <main className="picking-page-content">
                {errorMessage ? (
                    <section className="picking-empty-state picking-empty-state--error">
                        <h2>Unable to load this pick walk</h2>
                        <p>{errorMessage}</p>
                    </section>
                ) : null}

                {!errorMessage && isLoading ? (
                    <section className="picking-empty-state">
                        <h2>Preparing your pick walk…</h2>
                    </section>
                ) : null}

                {!errorMessage && !isLoading && !currentItem ? (
                    <section className="picking-empty-state">
                        <h2>No items are currently available for this commodity.</h2>
                        <p>Return to Commodity Select and choose another queue.</p>
                    </section>
                ) : null}

                {!errorMessage && !isLoading && currentItem ? (
                    <section className="picking-card">
                        <div className="picking-card-top-row">
                            <button type="button" className="picking-map-button" onClick={() => setIsMapOpen(true)}>
                                <svg
                                    className="picking-map-button-icon"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path
                                        d="M14.5 4L9.5 6L4 4V18L9.5 20L14.5 18L20 20V6L14.5 4ZM14 6.12V16.47L10 17.87V7.53L14 6.12ZM6 6.89L8 7.62V17.11L6 16.39V6.89ZM18 17.11L16 16.38V6.89L18 7.61V17.11Z"
                                        fill="currentColor"
                                    />
                                </svg>
                                <span className="picking-map-button-label">Map</span>
                            </button>

                            <div className="picking-location-pill-group">
                                <div className="picking-location-pill">
                                    <span className="label">Location</span>
                                    <strong>{formatLocationLabel(currentItem.location)}</strong>
                                </div>
                                <div className="picking-location-pill">
                                    <span className="label">Other</span>
                                    <strong>{Number(currentItem.otherLocationsCount || 0)}</strong>
                                </div>
                            </div>
                        </div>

                        <div className="picking-item-header-row">
                            <div className="picking-item-name-group">
                                <h1>{substituteMode ? substituteMode.originalEntry.substitute.name : currentItem.item.name}</h1>
                                {substituteMode ? (
                                    <span className="picking-substitute-badge">SUBSTITUTE</span>
                                ) : null}
                            </div>
                            <span className={`picking-qty-box ${currentQuantity >= 2 ? 'picking-qty-box--gold' : 'picking-qty-box--gray'}`}>
                                {currentQuantity} QTY
                            </span>
                        </div>

                        <div className="picking-image-wrap">
                            {(substituteMode ? substituteMode.originalEntry.substitute.imageUrl : currentItem.item.imageUrl) ? (
                                <img
                                    src={substituteMode ? substituteMode.originalEntry.substitute.imageUrl : currentItem.item.imageUrl}
                                    alt={substituteMode ? substituteMode.originalEntry.substitute.name : currentItem.item.name}
                                />
                            ) : (
                                <div className="picking-image-placeholder">ITEM IMAGE HERE</div>
                            )}
                        </div>

                        {substituteMode ? (
                            <div className="picking-original-item-section">
                                <span className="picking-field-label">Original Item</span>
                                <p className="picking-original-item-name">{substituteMode.originalEntry.item.name}</p>
                                <button
                                    type="button"
                                    className="picking-original-located-button"
                                    onClick={handleOriginalItemLocated}
                                >
                                    Original Item Located
                                </button>
                            </div>
                        ) : (
                            <div className="picking-special-instructions">
                                <span className="picking-field-label">Special Instructions</span>
                                <p>{currentItem.specialInstructions || 'No special instructions.'}</p>
                            </div>
                        )}

                        <div className="picking-info-grid">
                            <div className="picking-info-row">
                                <span className="key">UPC/PLU</span>
                                <strong>{(substituteMode ? substituteMode.originalEntry.substitute.upc : currentItem.item.upc) || '—'}</strong>
                            </div>
                            <div className="picking-info-row">
                                <span className="key">Price</span>
                                <strong>{toCurrency(substituteMode ? substituteMode.originalEntry.substitute.price : currentItem.item.price)} EA</strong>
                            </div>
                            {!substituteMode ? (
                                <>
                                    <div className="picking-info-row">
                                        <span className="key">On Hand</span>
                                        <strong>{Number(currentItem.onHandTotal || 0)}</strong>
                                    </div>
                                    {Object.entries(currentItem.onHandByAisle || {}).map(([aisle, qty]) => (
                                        <div className="picking-info-row" key={aisle}>
                                            <span className="key">{aisle}</span>
                                            <strong>{Number(qty || 0)}</strong>
                                        </div>
                                    ))}
                                </>
                            ) : null}
                        </div>

                        <div className="picking-actions-row">
                            <button type="button" className="picking-enter-quantity-button" onClick={() => setIsPickDialogOpen(true)}>
                                Enter Quantity
                            </button>
                            <button type="button" className="picking-skip-button" onClick={skipCurrentItem} aria-label="Skip item">
                                &gt;
                            </button>
                            <button type="button" className="picking-not-found-button" onClick={handleNotFound} aria-label="Item not found">
                                0
                            </button>
                        </div>
                    </section>
                ) : null}
            </main>

            {isMapOpen && currentItem ? (
                <div className="picking-modal-overlay" onClick={() => setIsMapOpen(false)}>
                    <section className="picking-map-modal" onClick={(event) => event.stopPropagation()}>
                        <h3>Current Item Map</h3>
                        <p className="picking-map-subtitle">Highlighted aisle for {currentItem.item.name}</p>
                        <div className="picking-map-grid">
                            {(aisles || []).map((aisle) => {
                                const aisleNumber = String(aisle.aisleNumber || '');
                                const isHighlighted = aisleNumber === String(currentItem?.location?.aisleNumber || '');

                                return (
                                    <div
                                        key={aisle.id || aisleNumber}
                                        className={`picking-map-aisle ${isHighlighted ? 'picking-map-aisle--highlighted' : ''}`}
                                    >
                                        Aisle {aisleNumber || '—'}
                                    </div>
                                );
                            })}
                            {(!aisles || aisles.length === 0) ? (
                                <div className="picking-map-empty">Map unavailable for this store.</div>
                            ) : null}
                        </div>
                        <button type="button" className="picking-modal-close" onClick={() => setIsMapOpen(false)}>
                            Close
                        </button>
                    </section>
                </div>
            ) : null}

            {isEndPromptOpen ? (
                <div className="picking-modal-overlay" onClick={() => setIsEndPromptOpen(false)}>
                    <section className="picking-confirm-modal" onClick={(event) => event.stopPropagation()}>
                        <h3>Are you sure you wish to end the pick walk?</h3>
                        <p>
                            Ending the pick walk early will make the items not yet picked reappear in the Commodity Select screen
                            and may slow down the backroom.
                        </p>
                        <div className="picking-confirm-actions">
                            <button type="button" onClick={() => setIsEndPromptOpen(false)} disabled={isEndingWalk}>
                                No
                            </button>
                            <button type="button" className="danger" onClick={endWalk} disabled={isEndingWalk}>
                                {isEndingWalk ? 'Ending\u2026' : 'Yes'}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {isPickDialogOpen && currentItem ? (
                <div className="picking-modal-overlay" onClick={() => { setIsPickDialogOpen(false); setPickDialogError(''); }}>
                    <section className="picking-enter-qty-modal" onClick={(event) => event.stopPropagation()}>
                        <h3>Enter Quantity</h3>

                        <div className="picking-enter-qty-field-group">
                            <label className="picking-enter-qty-label" htmlFor="pick-upc">UPC</label>
                            <input
                                id="pick-upc"
                                type="text"
                                className="picking-enter-qty-input"
                                value={pickUpcValue}
                                onChange={(e) => setPickUpcValue(e.target.value)}
                                placeholder="Scan or enter UPC"
                                autoFocus
                                disabled={isSubmittingPick}
                            />
                            <p className="picking-enter-qty-hint">
                                UPC: {(substituteMode ? substituteMode.originalEntry.substitute?.upc : currentItem.item.upc) || '\u2014'}
                            </p>
                        </div>

                        <div className="picking-enter-qty-field-group">
                            <label className="picking-enter-qty-label" htmlFor="pick-qty">Quantity</label>
                            <input
                                id="pick-qty"
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max={currentQuantity}
                                className="picking-enter-qty-input"
                                value={pickQtyValue}
                                onChange={(e) => setPickQtyValue(e.target.value)}
                                placeholder="Enter quantity picked"
                                disabled={isSubmittingPick}
                            />
                            <p className="picking-enter-qty-hint">
                                {currentQuantity} {currentQuantity === 1 ? 'unit' : 'units'} quantity remaining
                            </p>
                        </div>

                        {pickDialogError ? (
                            <p className="picking-enter-qty-error">{pickDialogError}</p>
                        ) : null}

                        <div className="picking-enter-qty-actions">
                            <button
                                type="button"
                                className="picking-enter-qty-cancel"
                                onClick={() => { setIsPickDialogOpen(false); setPickDialogError(''); }}
                                disabled={isSubmittingPick}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="picking-enter-qty-submit"
                                onClick={handlePickSubmit}
                                disabled={isSubmittingPick}
                            >
                                {isSubmittingPick ? 'Picking\u2026' : 'Pick'}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {isPickUpcMismatch ? (
                <div className="picking-modal-overlay" onClick={() => setIsPickUpcMismatch(false)}>
                    <section className="picking-confirm-modal" onClick={(event) => event.stopPropagation()}>
                        <h3>Error</h3>
                        <p>
                            The UPC scanned or entered does not match that of the item you need to pick.
                            Please scan the correct item.
                        </p>
                        <div className="picking-confirm-actions">
                            <button type="button" onClick={() => setIsPickUpcMismatch(false)}>
                                OK
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}
        </div>
    );
};

export default PickingPage;