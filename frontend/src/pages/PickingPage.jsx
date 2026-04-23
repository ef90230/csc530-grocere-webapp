import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from '../components/common/TopBar';
import StoreMapPreview from '../components/common/StoreMapPreview';
import './PickingPage.css';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
    clearActiveWalkTimeLimit,
    clearWalkTimeoutDialogPending,
    isTimeLimitedCommodity,
    readWalkTimeoutDialogPending,
    setActiveWalkTimeLimit
} from '../utils/walkTimeLimit';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const REPORT_TYPE_OPTIONS = [
    { id: 'item_cannot_fit', label: 'Item cannot fit' },
    { id: 'wrong_temperature_type', label: 'Wrong temperature type' },
    { id: 'remove_from_oversized', label: 'Remove from Oversized' },
    { id: 'item_locked_in_case', label: 'Item locked in case' },
    { id: 'remove_from_restricted', label: 'Remove from Restricted' },
    { id: 'incorrect_item_info', label: 'Incorrect item info' },
    { id: 'item_appeared_out_of_order', label: 'Item appeared out of order' }
];

const normalizeHighlightedAisleNumber = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || /^unassigned$/i.test(normalized)) {
        return '';
    }

    return normalized.replace(/^aisle\s+/i, '').trim();
};

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
        return 'No Location';
    }

    const aisle = location.aisleNumber || '?';
    const section = location.section ? ` \u00B7 Section ${location.section}` : '';
    return `Aisle ${aisle}${section}`;
};

const toAisleNumberValue = (aisleNumber) => {
    const normalized = String(aisleNumber || '').trim();
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const compareQueueEntriesByPath = (left, right) => {
    const leftPathIndex = Number(left?.location?.pathIndex ?? Number.MAX_SAFE_INTEGER);
    const rightPathIndex = Number(right?.location?.pathIndex ?? Number.MAX_SAFE_INTEGER);
    if (leftPathIndex !== rightPathIndex) {
        return leftPathIndex - rightPathIndex;
    }

    const leftAisle = toAisleNumberValue(left?.location?.aisleNumber);
    const rightAisle = toAisleNumberValue(right?.location?.aisleNumber);
    if (leftAisle !== rightAisle) {
        return leftAisle - rightAisle;
    }

    return String(left?.item?.name || '').localeCompare(String(right?.item?.name || ''));
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
    const [isReportMenuOpen, setIsReportMenuOpen] = useState(false);
    const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
    const [selectedReportTypes, setSelectedReportTypes] = useState([]);
    const [isSubmittingReport, setIsSubmittingReport] = useState(false);
    const [reportDialogError, setReportDialogError] = useState('');
    const [isTimeLimitDialogOpen, setIsTimeLimitDialogOpen] = useState(false);

    const videoRef = useRef(null);
    const zxingControlsRef = useRef(null);
    const isHandlingScanRef = useRef(false);
    const expectedUpcRef = useRef('');
    const currentItemRef = useRef(null);
    const currentQuantityRef = useRef(0);
    const handleCameraMatchRef = useRef(null);
    const closeCameraModalRef = useRef(null);
    const reportWalkMistakeRef = useRef(null);

    const selectedCommodity = location?.state?.commodity;
    const selectedCommodityLabel = location?.state?.commodityLabel;

    const syncWalkTimeLimit = ({ commodity, commodityLabel, storeId: activeStoreId, walkStartedAt: startedAt }) => {
        if (!isTimeLimitedCommodity(commodity)) {
            clearActiveWalkTimeLimit();
            clearWalkTimeoutDialogPending();
            return;
        }

        setActiveWalkTimeLimit({
            commodity,
            commodityLabel,
            storeId: activeStoreId,
            walkStartedAt: startedAt
        });
    };

    const filterActionableQueue = (rows = []) => rows.filter(
        (row) => Math.max(0, Number(row?.quantityToPick || 0)) > 0
    );

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

                const [activeWalkResponse, aislesResponse] = await Promise.all([
                    fetch(`${API_BASE}/api/orders/picking/walk/list/${resolvedStoreId}?commodity=${encodeURIComponent(selectedCommodity)}`, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        },
                        signal: controller.signal
                    }),
                    fetch(`${API_BASE}/api/aisles/store/${resolvedStoreId}`, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        },
                        signal: controller.signal
                    })
                ]);

                let walkPayload = null;

                if (!activeWalkResponse.ok) {
                    throw new Error('Unable to check for an active pick walk.');
                }

                const activeWalkPayload = await activeWalkResponse.json();
                const hasMatchingActiveWalk = Boolean(activeWalkPayload?.hasActiveWalk)
                    && String(activeWalkPayload?.commodity || '').toLowerCase() === String(selectedCommodity || '').toLowerCase();

                if (hasMatchingActiveWalk) {
                    const fullQueue = Array.isArray(activeWalkPayload?.queue) ? activeWalkPayload.queue : [];
                    setQueue(filterActionableQueue(fullQueue));
                    setCompletedUnits(Math.max(0, Number(activeWalkPayload?.completedUnits || 0)));
                    const resolvedWalkStartedAt = activeWalkPayload?.walkStartedAt || new Date().toISOString();
                    setWalkStartedAt(resolvedWalkStartedAt);
                    syncWalkTimeLimit({
                        commodity: activeWalkPayload?.commodity || selectedCommodity,
                        commodityLabel: activeWalkPayload?.displayName || selectedCommodityLabel,
                        storeId: resolvedStoreId,
                        walkStartedAt: resolvedWalkStartedAt
                    });
                } else {
                    const startWalkResponse = await fetch(`${API_BASE}/api/orders/picking/walk/start`, {
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
                    });

                    if (!startWalkResponse.ok) {
                        throw new Error('Unable to start pick walk for the selected commodity.');
                    }

                    walkPayload = await startWalkResponse.json();
                    const resolvedQueue = Array.isArray(walkPayload?.queue) ? walkPayload.queue : [];
                    setQueue(resolvedQueue);
                    setCompletedUnits(Math.max(0, Number(walkPayload?.completedUnits || 0)));
                    const resolvedWalkStartedAt = walkPayload?.walkStartedAt || new Date().toISOString();
                    setWalkStartedAt(resolvedWalkStartedAt);
                    syncWalkTimeLimit({
                        commodity: walkPayload?.commodity || selectedCommodity,
                        commodityLabel: walkPayload?.displayName || selectedCommodityLabel,
                        storeId: resolvedStoreId,
                        walkStartedAt: resolvedWalkStartedAt
                    });
                }

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
    }, [navigate, selectedCommodity, selectedCommodityLabel]);

    useEffect(() => {
        if (!selectedCommodity) {
            return;
        }

        if (!isTimeLimitedCommodity(selectedCommodity)) {
            clearWalkTimeoutDialogPending();
            return;
        }

        if (!readWalkTimeoutDialogPending()) {
            return;
        }

        setIsEndPromptOpen(false);
        setIsPickDialogOpen(false);
        setIsPickUpcMismatch(false);
        setIsCameraOpen(false);
        setIsReportDialogOpen(false);
        setIsTimeLimitDialogOpen(true);
    }, [selectedCommodity]);

    const remainingUnits = useMemo(() => (
        queue.reduce((sum, row) => sum + Number(row?.quantityToPick || 0), 0)
    ), [queue]);
    const totalUnits = completedUnits + remainingUnits;

    const currentItem = queue[0] || null;
    const currentQuantity = Number(currentItem?.quantityToPick || 0);
    const currentOrderSymbol = String(currentItem?.orderSymbol || '').trim().toUpperCase();
    const currentItemHighlightedAisles = useMemo(() => {
        const aisleNumbers = (currentItem?.allLocations || [])
            .filter((itemLocation) => Number(itemLocation?.quantityOnHand) > 0)
            .map((itemLocation) => normalizeHighlightedAisleNumber(itemLocation?.aisleNumber))
            .filter(Boolean);

        if (aisleNumbers.length > 0) {
            return Array.from(new Set(aisleNumbers));
        }

        const onHandAisles = Object.entries(currentItem?.onHandByAisle || {})
            .filter(([, quantity]) => Number(quantity) > 0)
            .map(([aisleNumber]) => normalizeHighlightedAisleNumber(aisleNumber))
            .filter(Boolean);

        if (onHandAisles.length > 0) {
            return Array.from(new Set(onHandAisles));
        }

        const fallbackAisle = normalizeHighlightedAisleNumber(currentItem?.location?.aisleNumber);
        return fallbackAisle ? [fallbackAisle] : [];
    }, [currentItem]);
    const onHandAisleCount = Object.keys(currentItem?.onHandByAisle || {}).length;
    const shouldAllowMobileScroll = !substituteMode && onHandAisleCount > 5;
    const expectedUpc = substituteMode
        ? (substituteMode.originalEntry.substitute?.upc || '')
        : (currentItem?.item?.upc || '');
    const commodityTitle = useMemo(() => {
        const fallback = deriveCommodityTitle(selectedCommodity || 'Commodity');
        return deriveCommodityTitle(selectedCommodityLabel || fallback);
    }, [selectedCommodity, selectedCommodityLabel]);
    const displayedItem = substituteMode ? substituteMode.originalEntry.substitute : currentItem?.item;

    const normalizeUpc = (value = '') => String(value || '').replace(/\D/g, '');

    const stopCameraSession = () => {
        zxingControlsRef.current?.stop();
        zxingControlsRef.current = null;
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

    const closeReportDialog = () => {
        setIsReportDialogOpen(false);
        setSelectedReportTypes([]);
        setReportDialogError('');
        setIsSubmittingReport(false);
    };

    const toggleReportType = (reportTypeId) => {
        setSelectedReportTypes((previous) => (
            previous.includes(reportTypeId)
                ? previous.filter((value) => value !== reportTypeId)
                : [...previous, reportTypeId]
        ));
    };

    const openReportDialog = () => {
        setIsReportMenuOpen(false);
        setSelectedReportTypes([]);
        setReportDialogError('');
        setIsReportDialogOpen(true);
    };

    const openPickListPage = () => {
        setIsReportMenuOpen(false);
        navigate('/pick-list', {
            state: {
                storeId,
                commodity: selectedCommodity,
                commodityLabel: commodityTitle
            }
        });
    };

    const sendItemReport = async () => {
        if (!currentItem || !displayedItem) {
            setReportDialogError('No active item is available to report.');
            return;
        }

        if (selectedReportTypes.length === 0) {
            setReportDialogError('Select at least one report type.');
            return;
        }

        const token = window.localStorage.getItem('authToken');
        setIsSubmittingReport(true);
        setReportDialogError('');

        try {
            const response = await fetch(`${API_BASE}/api/alerts/reports`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reportTypes: selectedReportTypes,
                    orderId: currentItem.orderId,
                    itemId: displayedItem.id,
                    itemName: displayedItem.name,
                    locationLabel: formatLocationLabel(currentItem.location)
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'Unable to send report.');
            }

            closeReportDialog();
        } catch (error) {
            setReportDialogError(error.message || 'Unable to send report.');
            setIsSubmittingReport(false);
        }
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
                            substitutedItemId: substituteMode?.originalEntry?.substitute?.id || null,
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

        if (!navigator?.mediaDevices?.getUserMedia) {
            setCameraMessage('Camera unavailable');
            return;
        }

        setIsCameraOpen(true);
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

    // Keep refs current so the ZXing callback always has the latest values/functions.
    expectedUpcRef.current = expectedUpc;
    currentItemRef.current = currentItem;
    currentQuantityRef.current = currentQuantity;
    handleCameraMatchRef.current = handleCameraMatch;
    closeCameraModalRef.current = closeCameraModal;
    reportWalkMistakeRef.current = reportWalkMistake;

    useEffect(() => {
        if (!isCameraOpen || !videoRef.current) {
            return undefined;
        }

        const videoElement = videoRef.current;
        const reader = new BrowserMultiFormatReader();
        isHandlingScanRef.current = false;

        const startReader = async () => {
            try {
                const controls = await reader.decodeFromConstraints(
                    { video: { facingMode: { ideal: 'environment' } } },
                    videoElement,
                    (result) => {
                        if (!result || isHandlingScanRef.current) return;

                        const scannedRaw = String(result.getText() || '').trim();
                        const normalizedScanned = normalizeUpc(scannedRaw);
                        const normalizedExpected = normalizeUpc(expectedUpcRef.current);

                        if (!normalizedScanned || !normalizedExpected) return;

                        isHandlingScanRef.current = true;

                        if (normalizedScanned === normalizedExpected) {
                            handleCameraMatchRef.current?.();
                        } else {
                            const doMismatch = async () => {
                                try {
                                    await reportWalkMistakeRef.current?.(currentItemRef.current, 1, 'error');
                                } catch {
                                    // Continue regardless of reporting failure
                                }
                                closeCameraModalRef.current?.();
                                setIsPickUpcMismatch(true);
                                isHandlingScanRef.current = false;
                            };
                            doMismatch();
                        }
                    }
                );
                zxingControlsRef.current = controls;
            } catch (error) {
                console.error('Unable to start barcode scanner', error);
                setIsCameraOpen(false);
                setCameraMessage('Camera unavailable');
            }
        };

        startReader();

        return () => {
            zxingControlsRef.current?.stop();
            zxingControlsRef.current = null;
            isHandlingScanRef.current = false;
            if (videoElement) {
                videoElement.srcObject = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCameraOpen]);

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

        const hasAlternateLocations = Array.isArray(item?.allLocations) && item.allLocations.length > 1;
        if (hasAlternateLocations) {
            await reportWalkMistake(item, 1, 'not_found');

            setQueue((previousQueue) => {
                if (!Array.isArray(previousQueue) || previousQueue.length === 0) {
                    return previousQueue;
                }

                const [head, ...rest] = previousQueue;
                const remainingLocations = Array.isArray(head?.allLocations)
                    ? head.allLocations.slice(1)
                    : [];

                if (remainingLocations.length === 0) {
                    return previousQueue;
                }

                const updatedHead = {
                    ...head,
                    location: remainingLocations[0],
                    allLocations: remainingLocations,
                    otherLocationsCount: Math.max(remainingLocations.length - 1, 0)
                };

                return [...rest, updatedHead].sort(compareQueueEntriesByPath);
            });

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

    const endWalk = async (endedEarly = false) => {
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
                    commodity: selectedCommodity,
                    endedEarly
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
                clearActiveWalkTimeLimit();
                clearWalkTimeoutDialogPending();
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
                leftActionLabel="X"
                leftActionAriaLabel="End pick walk"
                onLeftAction={() => setIsEndPromptOpen(true)}
                extraActionLabel="⋮"
                extraActionAriaLabel="Toggle item reporting actions"
                onExtraAction={() => setIsReportMenuOpen((previous) => !previous)}
                isExtraActionMenuOpen={isReportMenuOpen}
                extraActionMenu={(
                    <div className="picking-report-menu-list">
                        <button type="button" className="picking-report-menu-button" onClick={openPickListPage}>
                            Pick List
                        </button>
                        <button type="button" className="picking-report-menu-button" onClick={openReportDialog}>
                            Report Item
                        </button>
                    </div>
                )}
                statMode="walk"
                walkCompletedUnits={completedUnits}
                walkTotalUnits={totalUnits}
                walkStartedAt={walkStartedAt}
            />

            <main className={`picking-page-content ${shouldAllowMobileScroll ? 'picking-page-content--allow-scroll' : ''}`}>
                {errorMessage ? (
                    <section className="picking-empty-state picking-empty-state--error">
                        <h2>Unable to load this pick walk</h2>
                        <p>{errorMessage}</p>
                    </section>
                ) : null}

                {!errorMessage && isLoading ? (
                    <section className="picking-empty-state">
                        <h2>Preparing your pick walk...</h2>
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

                        <div className="picking-order-identity">
                            {currentOrderSymbol ? (
                                <span className={`picking-order-symbol picking-order-symbol--${currentOrderSymbol.toLowerCase()}`}>
                                    {currentOrderSymbol}
                                </span>
                            ) : null}
                            <div className="picking-order-identity-copy">
                                <span className="picking-field-label">Order</span>
                                <strong>{currentItem.orderNumber || 'No order number'}</strong>
                            </div>
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

            {isTimeLimitDialogOpen ? (
                <div className="picking-modal-overlay">
                    <section className="picking-confirm-modal" onClick={(event) => event.stopPropagation()}>
                        <h3>Time&apos;s Up!</h3>
                        <p>
                            To protect the quality of temperature-controlled items, this walk has ended and remaining items
                            will rejoin the pick queue. Return to your backroom immediately for staging.
                        </p>
                        <div className="picking-confirm-actions">
                            <button
                                type="button"
                                onClick={() => {
                                    clearWalkTimeoutDialogPending();
                                    endWalk(true);
                                }}
                                disabled={isEndingWalk}
                            >
                                {isEndingWalk ? 'Ending…' : 'OK'}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {isMapOpen && currentItem ? (
                <div className="picking-modal-overlay" onClick={() => setIsMapOpen(false)}>
                    <section className="picking-map-modal" onClick={(event) => event.stopPropagation()}>
                        <h3>Current Item Map</h3>
                        <p className="picking-map-subtitle">Highlighted aisles for {currentItem.item.name}</p>
                        <StoreMapPreview
                            aisles={aisles || []}
                            highlightedAisleNumbers={currentItemHighlightedAisles}
                            title=""
                            emptyMessage="Map unavailable for this store."
                            className="picking-map-preview"
                        />
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
                            <button type="button" className="danger" onClick={() => endWalk(true)} disabled={isEndingWalk}>
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

            {isReportDialogOpen && currentItem && displayedItem ? (
                <div className="picking-modal-overlay" onClick={closeReportDialog}>
                    <section className="picking-report-modal" onClick={(event) => event.stopPropagation()}>
                        <h3>What would you like to report?</h3>
                        <p className="picking-report-subtitle">{displayedItem.name}</p>
                        <div className="picking-report-options">
                            {REPORT_TYPE_OPTIONS.map((option) => {
                                const isSelected = selectedReportTypes.includes(option.id);
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className={`picking-report-option ${isSelected ? 'picking-report-option--selected' : ''}`}
                                        onClick={() => toggleReportType(option.id)}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                        {reportDialogError ? <p className="picking-report-error">{reportDialogError}</p> : null}
                        <div className="picking-report-actions">
                            <button type="button" className="picking-report-back" onClick={closeReportDialog} disabled={isSubmittingReport}>
                                Back
                            </button>
                            <button
                                type="button"
                                className="picking-report-send"
                                onClick={sendItemReport}
                                disabled={isSubmittingReport || selectedReportTypes.length === 0}
                            >
                                {isSubmittingReport ? 'Sending…' : 'Send Report'}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}
        </div>
    );
};

export default PickingPage;

