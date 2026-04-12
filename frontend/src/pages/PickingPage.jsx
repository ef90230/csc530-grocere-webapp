import React, { useEffect, useMemo, useRef, useState } from 'react';
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

    const aisle = location.aisleNumber || 'â€”';
    const section = location.section ? ` â€¢ Section ${location.section}` : '';
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
    const [isSubmittingNotFound, setIsSubmittingNotFound] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [cameraMessage, setCameraMessage] = useState('');

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const detectorRef = useRef(null);
    const scanFrameRef = useRef(null);
    const isHandlingScanRef = useRef(false);

    const selectedCommodity = location?.state?.commodity;
    const selectedCommodityLabel = location?.state?.commodityLabel;

    useEffect(() => {
        const token = window.localStorage.getItem('authToken');
        const userType = window.localStorage.getItem('userType');

        if (!token || (userType !== 'employee' && userType !== 'admin')) {
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
                setWalkStartedAt(walkPayload?.walkStartedAt || new Date().toISOString());

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
    const expectedUpc = substituteMode
        ? (substituteMode.originalEntry.substitute?.upc || '')
        : (currentItem?.item?.upc || '');
    const commodityTitle = useMemo(() => {
        const fallback = deriveCommodityTitle(selectedCommodity || 'Commodity');
        return deriveCommodityTitle(selectedCommodityLabel || fallback);
    }, [selectedCommodity, selectedCommodityLabel]);

    const normalizeUpc = (value = '') => String(value || '').replace(/\D/g, '');

    const stopCameraSession = () => {
        if (scanFrameRef.current) {
            window.cancelAnimationFrame(scanFrameRef.current);
            scanFrameRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        detectorRef.current = null;
        isHandlingScanRef.current = false;

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    const closeCameraModal = () => {
        stopCameraSession();
        setIsCameraOpen(false);
    };

    const reportWalkMistake = async (entry, quantity, reason = 'error') => {
        const token = window.localStorage.getItem('authToken');
        const mistakeQty = Number(quantity);

        if (!token || !entry?.orderId || !entry?.orderItemId || !Number.isInteger(mistakeQty) || mistakeQty < 1) {
            return;
        }

        try {
            await fetch(`${API_BASE}/api/orders/picking/walk/mistake`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderId: entry.orderId,
                    orderItemId: entry.orderItemId,
                    quantity: mistakeQty,
                    reason
                })
            });
        } catch {
            // Ignore reporting failures so picking flow is not blocked.
        }
    };

    const skipCurrentItem = () => {
        const activeEntry = substituteMode?.originalEntry || queue[0];
        if (activeEntry) {
            reportWalkMistake(activeEntry, 1, 'skip');
        }

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

    const submitPick = async ({ upcValue, quantityValue, showDialogErrors = true }) => {
        const trimmedUpc = String(upcValue || '').trim();
        const parsedQty = Number(String(quantityValue || '').trim());

        if (!trimmedUpc) {
            if (showDialogErrors) {
                setPickDialogError('UPC is required.');
            } else {
                setErrorMessage('UPC is required.');
            }
            return false;
        }
        if (String(quantityValue || '').trim() === '') {
            if (showDialogErrors) {
                setPickDialogError('Quantity is required.');
            } else {
                setErrorMessage('Quantity is required.');
            }
            return false;
        }
        if (!Number.isInteger(parsedQty) || parsedQty < 1) {
            if (showDialogErrors) {
                setPickDialogError('Quantity must be a whole number of at least 1.');
            } else {
                setErrorMessage('Quantity must be a whole number of at least 1.');
            }
            return false;
        }
        if (parsedQty > currentQuantity) {
            if (showDialogErrors) {
                setPickDialogError(`Quantity cannot exceed ${currentQuantity}.`);
            } else {
                setErrorMessage(`Quantity cannot exceed ${currentQuantity}.`);
            }
            return false;
        }

        if (showDialogErrors) {
            setPickDialogError('');
        }

        if (normalizeUpc(trimmedUpc) !== normalizeUpc(expectedUpc)) {
            await reportWalkMistake(currentItem, Math.max(1, parsedQty), 'error');
            if (showDialogErrors) {
                setIsPickDialogOpen(false);
            }
            setIsPickUpcMismatch(true);
            return false;
        }

        const token = window.localStorage.getItem('authToken');
        setIsSubmittingPick(true);

        try {
            let response;
            if (substituteMode) {
                // Record substitute pick via updateOrderItem with status 'substituted'
                response = await fetch(
                    `${API_BASE}/api/orders/${currentItem.orderId}/items/${currentItem.orderItemId}`,
                    {
                        method: 'PUT',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            status: 'substituted',
                            pickedQuantity: parsedQty
                        })
                    }
                );
            } else {
                response = await fetch(`${API_BASE}/api/orders/picking/walk/record-pick`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        orderId: currentItem.orderId,
                        orderItemId: currentItem.orderItemId,
                        pickedQuantity: parsedQty,
                        locationId: currentItem.location?.locationId || null
                    })
                });
            }

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                const message = payload.message || 'Server error recording pick.';
                await reportWalkMistake(currentItem, Math.max(1, parsedQty), 'error');
                if (showDialogErrors) {
                    setPickDialogError(message);
                } else {
                    setErrorMessage(message);
                }
                return false;
            }

            setCompletedUnits((prev) => prev + parsedQty);
            setIsPickDialogOpen(false);
            setPickUpcValue('');
            setPickQtyValue('');

            const newQty = currentQuantity - parsedQty;
            if (substituteMode || newQty <= 0) {
                // Substitute pick (any qty = done) or original fully picked: advance
                setSubstituteMode(null);
                if (queue.length === 1) {
                    await endWalk();
                    return true;
                }
                setQueue((prev) => prev.slice(1));
                return true;
            }

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
                        pickedQuantity: Number(head.pickedQuantity || 0) + parsedQty,
                        onHandTotal: Math.max(0, Number(head.onHandTotal || 0) - parsedQty),
                        onHandByAisle: updatedOnHandByAisle
                    },
                    ...rest
                ];
            });

            return true;
        } catch (err) {
            console.error('Record pick failed', err);
            await reportWalkMistake(currentItem, Math.max(1, parsedQty), 'error');
            if (showDialogErrors) {
                setPickDialogError('Network error. Please try again.');
            } else {
                setErrorMessage('Network error. Please try again.');
            }
            return false;
        } finally {
            setIsSubmittingPick(false);
        }
    };

    const handleOpenCamera = async () => {
        setCameraMessage('');

        const BarcodeDetectorApi = window.BarcodeDetector;
        const mediaDevices = navigator?.mediaDevices;

        if (!BarcodeDetectorApi || !mediaDevices?.getUserMedia) {
            setCameraMessage('Camera unavailable');
            return;
        }

        try {
            if (typeof BarcodeDetectorApi.getSupportedFormats === 'function') {
                const supportedFormats = await BarcodeDetectorApi.getSupportedFormats();
                const hasUpcSupport = supportedFormats.includes('upc_a') || supportedFormats.includes('upc_e');
                if (!hasUpcSupport) {
                    setCameraMessage('Camera unavailable');
                    return;
                }
            }

            const stream = await mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' }
                },
                audio: false
            });

            streamRef.current = stream;
            detectorRef.current = new BarcodeDetectorApi({ formats: ['upc_a', 'upc_e'] });
            setIsCameraOpen(true);
        } catch (error) {
            console.error('Unable to open camera', error);
            stopCameraSession();
            setIsCameraOpen(false);
            setCameraMessage('Camera unavailable');
        }
    };

    const handleCameraMatch = async () => {
        closeCameraModal();

        if (currentQuantity === 1) {
            await submitPick({ upcValue: expectedUpc, quantityValue: '1', showDialogErrors: false });
            return;
        }

        setPickDialogError('');
        setPickUpcValue(expectedUpc);
        setPickQtyValue('');
        setIsPickDialogOpen(true);
    };

    useEffect(() => {
        if (!isCameraOpen || !videoRef.current || !streamRef.current || !detectorRef.current) {
            return undefined;
        }

        const video = videoRef.current;
        video.srcObject = streamRef.current;

        const startScanning = async () => {
            try {
                await video.play();
            } catch (error) {
                console.error('Unable to start camera preview', error);
                closeCameraModal();
                setCameraMessage('Camera unavailable');
                return;
            }

            const scan = async () => {
                if (!detectorRef.current || !videoRef.current || isHandlingScanRef.current) {
                    scanFrameRef.current = window.requestAnimationFrame(scan);
                    return;
                }

                try {
                    const barcodes = await detectorRef.current.detect(videoRef.current);
                    if (Array.isArray(barcodes) && barcodes.length > 0) {
                        const scannedRaw = String(barcodes[0]?.rawValue || '').trim();
                        const normalizedScanned = normalizeUpc(scannedRaw);
                        const normalizedExpected = normalizeUpc(expectedUpc);

                        if (normalizedScanned && normalizedExpected) {
                            isHandlingScanRef.current = true;

                            if (normalizedScanned === normalizedExpected) {
                                await handleCameraMatch();
                            } else {
                                await reportWalkMistake(currentItem, 1, 'error');
                                closeCameraModal();
                                setIsPickUpcMismatch(true);
                            }

                            isHandlingScanRef.current = false;
                            return;
                        }
                    }
                } catch (error) {
                    console.error('Barcode detection failed', error);
                }

                scanFrameRef.current = window.requestAnimationFrame(scan);
            };

            scanFrameRef.current = window.requestAnimationFrame(scan);
        };

        startScanning();

        return () => {
            stopCameraSession();
        };
    // Effect intentionally depends on scan context, while helpers use refs/state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCameraOpen, expectedUpc, currentQuantity]);

    useEffect(() => () => {
        stopCameraSession();
    }, []);

    const markItemOutOfStock = async (entry) => {
        const token = window.localStorage.getItem('authToken');

        if (!token || !entry?.orderId || !entry?.orderItemId) {
            return false;
        }

        try {
            const response = await fetch(`${API_BASE}/api/orders/${entry.orderId}/items/${entry.orderItemId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'out_of_stock',
                    pickedQuantity: Number(entry?.pickedQuantity || 0),
                    countAsNotFoundMetric: true
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.message || 'Unable to mark item as not found.');
            }

            return true;
        } catch (error) {
            console.error('Unable to mark item out of stock', error);
            setErrorMessage(error.message || 'Unable to mark item as not found.');
            return false;
        }
    };

    const handleNotFound = async () => {
        if (isSubmittingNotFound) {
            return;
        }

        setIsSubmittingNotFound(true);

        if (substituteMode) {
            // Sub item not found: remove the original item entirely and exit substitute mode
            const wasMarked = await markItemOutOfStock(substituteMode.originalEntry);
            if (!wasMarked) {
                setIsSubmittingNotFound(false);
                return;
            }

            setSubstituteMode(null);
            setQueue((previousQueue) => {
                const remaining = previousQueue.slice(1);
                if (remaining.length === 0) {
                    endWalk();
                }
                return remaining;
            });
            setIsSubmittingNotFound(false);
            return;
        }

        const item = queue[0];
        if (!item) {
            setIsSubmittingNotFound(false);
            return;
        }

        if (item.substitute && Number(item.pickedQuantity || 0) === 0) {
            // Only enter substitute mode if nothing has been picked for this item yet
            setSubstituteMode({ originalEntry: item });
            setIsSubmittingNotFound(false);
            return;
        }

        const wasMarked = await markItemOutOfStock(item);
        if (!wasMarked) {
            setIsSubmittingNotFound(false);
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
        setIsSubmittingNotFound(false);
    };

    const handlePickSubmit = async () => {
        await submitPick({
            upcValue: pickUpcValue,
            quantityValue: pickQtyValue,
            showDialogErrors: true
        });
    };

    const endWalk = async () => {
        const token = window.localStorage.getItem('authToken');
        if (!token || !storeId || !selectedCommodity) {
            navigate('/commodityselect');
            return;
        }

        setIsEndingWalk(true);
        let walkEndedCleanly = false;

        try {
            const response = await fetch(`${API_BASE}/api/orders/picking/walk/end`, {
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

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.message || 'Unable to end walk cleanly.');
            }

            walkEndedCleanly = true;
        } catch (error) {
            console.error('Unable to end walk cleanly', error);
        } finally {
            if (walkEndedCleanly) {
                navigate('/commodityselect', {
                    state: {
                        completedWalk: true,
                        completedCommodity: selectedCommodity,
                        completedAt: Date.now()
                    }
                });
            } else {
                navigate('/commodityselect');
            }
        }
    };

    return (
        <div className="picking-page">
            <TopBar
                title={`${commodityTitle} Picking`}
                leftActionLabel="Ã—"
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
                        <h2>Preparing your pick walkâ€¦</h2>
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
                                <div className="picking-original-item-row">
                                    <p className="picking-original-item-name">{substituteMode.originalEntry.item.name}</p>
                                    <span className="picking-original-item-qty">
                                        {Number(substituteMode.originalEntry.quantityToPick || 0)} QTY
                                    </span>
                                </div>
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
                                <strong>{(substituteMode ? substituteMode.originalEntry.substitute.upc : currentItem.item.upc) || 'â€”'}</strong>
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

                        {cameraMessage ? (
                            <p className="picking-camera-message">{cameraMessage}</p>
                        ) : null}

                        <div className="picking-actions-row">
                            <div className="picking-primary-actions">
                                <button type="button" className="picking-enter-quantity-button" onClick={() => setIsPickDialogOpen(true)}>
                                    Enter Quantity
                                </button>
                                <button type="button" className="picking-open-camera-button" onClick={handleOpenCamera}>
                                    Open Camera
                                </button>
                            </div>
                            <button type="button" className="picking-skip-button" onClick={skipCurrentItem} aria-label="Skip item">
                                &gt;
                            </button>
                            <button
                                type="button"
                                className="picking-not-found-button"
                                onClick={handleNotFound}
                                aria-label="Item not found"
                                disabled={isSubmittingNotFound}
                            >
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
                                        Aisle {aisleNumber || 'â€”'}
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

            {isCameraOpen ? (
                <div className="picking-modal-overlay" onClick={closeCameraModal}>
                    <section className="picking-camera-modal" onClick={(event) => event.stopPropagation()}>
                        <h3>Scan UPC Barcode</h3>
                        <p>Point the camera at the UPC-A or UPC-E barcode.</p>
                        <video
                            ref={videoRef}
                            className="picking-camera-preview"
                            autoPlay
                            muted
                            playsInline
                        />
                        <button type="button" className="picking-modal-close" onClick={closeCameraModal}>
                            Close
                        </button>
                    </section>
                </div>
            ) : null}
        </div>
    );
};

export default PickingPage;

