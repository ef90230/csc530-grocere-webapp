import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import StagingLocationForm from '../components/staging/StagingLocationForm';
import './StagingLocationsPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const TYPE_SORT_ORDER = ['ambient', 'chilled', 'frozen', 'hot', 'oversized'];
const ITEM_TYPE_LABELS = {
    ambient: 'Ambient',
    chilled: 'Chilled',
    frozen: 'Frozen',
    hot: 'Hot',
    oversized: 'Oversized'
};

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

const typeSortIndex = (type) => {
    const index = TYPE_SORT_ORDER.indexOf(type);
    return index === -1 ? TYPE_SORT_ORDER.length : index;
};

const getModalStatusLabel = (status) => {
    if (status === 'staged') {
        return 'Staged';
    }

    if (status === 'picking') {
        return 'Picking';
    }

    if (status === 'not_yet_picked') {
        return 'Not Yet Picked';
    }

    return 'Unstaged';
};

const getModalStatusFlagClass = (status) => {
    if (status === 'staged') {
        return 'staging-group-status--staged';
    }

    if (status === 'picking') {
        return 'staging-group-status--picking';
    }

    if (status === 'not_yet_picked') {
        return 'staging-group-status--not-yet-picked';
    }

    return 'staging-group-status--unstaged';
};

const buildOrderToteKey = (orderId, commodity) => `${orderId}:${commodity}`;

const StagingLocationsPage = () => {
    const navigate = useNavigate();
    const userType = window.localStorage.getItem('userType');
    const isAdmin = userType === 'admin';
    const [locations, setLocations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [sortMode, setSortMode] = useState('type-name');

    const [currentLimit, setCurrentLimit] = useState(10);
    const [minimumAllowedLimit, setMinimumAllowedLimit] = useState(1);

    const [isLocationFormOpen, setIsLocationFormOpen] = useState(false);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [isLocationEditOpen, setIsLocationEditOpen] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dialogErrorMessage, setDialogErrorMessage] = useState('');

    const [expandedLocationId, setExpandedLocationId] = useState(null);
    const [locationTotesById, setLocationTotesById] = useState({});

    const [limitDraft, setLimitDraft] = useState('10');
    const [locationNameDraft, setLocationNameDraft] = useState('');
    const [locationCodeDraft, setLocationCodeDraft] = useState('');
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [isOrderTotesModalOpen, setIsOrderTotesModalOpen] = useState(false);
    const [isOrderTotesLoading, setIsOrderTotesLoading] = useState(false);
    const [selectedTote, setSelectedTote] = useState(null);
    const [orderTotesSummary, setOrderTotesSummary] = useState(null);
    const [updatingOrderToteKey, setUpdatingOrderToteKey] = useState('');
    const [isCodeScannerOpen, setIsCodeScannerOpen] = useState(false);
    const [codeScannerMessage, setCodeScannerMessage] = useState('');

    const codeScannerVideoRef = useRef(null);
    const codeScannerStreamRef = useRef(null);
    const codeScannerDetectorRef = useRef(null);
    const codeScannerFrameRef = useRef(null);
    const codeScannerHandlingRef = useRef(false);

    const token = window.localStorage.getItem('authToken');

    const normalizeScannedCode = (value = '') => String(value || '').trim();

    const stopCodeScannerSession = () => {
        if (codeScannerFrameRef.current) {
            window.cancelAnimationFrame(codeScannerFrameRef.current);
            codeScannerFrameRef.current = null;
        }

        if (codeScannerStreamRef.current) {
            codeScannerStreamRef.current.getTracks().forEach((track) => track.stop());
            codeScannerStreamRef.current = null;
        }

        codeScannerDetectorRef.current = null;
        codeScannerHandlingRef.current = false;

        if (codeScannerVideoRef.current) {
            codeScannerVideoRef.current.srcObject = null;
        }
    };

    const closeCodeScannerModal = () => {
        stopCodeScannerSession();
        setIsCodeScannerOpen(false);
    };

    const handleOpenCodeScanner = async () => {
        setCodeScannerMessage('');

        const BarcodeDetectorApi = window.BarcodeDetector;
        const mediaDevices = navigator?.mediaDevices;

        if (!BarcodeDetectorApi || !mediaDevices?.getUserMedia) {
            setCodeScannerMessage('Camera unavailable');
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
                setCodeScannerMessage('No supported barcode formats found on this device.');
                return;
            }

            const stream = await mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' }
                },
                audio: false
            });

            codeScannerStreamRef.current = stream;
            codeScannerDetectorRef.current = new BarcodeDetectorApi({ formats: detectorFormats });
            setIsCodeScannerOpen(true);
        } catch (error) {
            console.error('Unable to open code scanner', error);
            stopCodeScannerSession();
            setIsCodeScannerOpen(false);
            setCodeScannerMessage('Camera unavailable');
        }
    };

    const loadLocations = useCallback(async (signal) => {
        const response = await fetch(`${API_BASE}/api/staging-locations`, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            signal
        });

        if (!response.ok) {
            throw new Error('Unable to load staging locations.');
        }

        const payload = await response.json();
        const resolvedLocations = Array.isArray(payload?.locations) ? payload.locations : [];
        setLocations(resolvedLocations);
        setCurrentLimit(Number(payload?.currentLimit || 10));
        setMinimumAllowedLimit(Number(payload?.minimumAllowedLimit || 1));
        setLimitDraft(String(Number(payload?.currentLimit || 10)));
    }, [token]);

    useEffect(() => {
        const userType = window.localStorage.getItem('userType');
        if (!token || (userType !== 'employee' && userType !== 'admin')) {
            navigate('/');
            return undefined;
        }

        const controller = new AbortController();

        const loadPage = async () => {
            try {
                setErrorMessage('');
                setIsLoading(true);
                await loadLocations(controller.signal);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Unable to load staging locations', error);
                    setErrorMessage(error.message || 'Unable to load staging locations.');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        loadPage();

        return () => controller.abort();
    }, [loadLocations, navigate, token]);

    const sortedLocations = useMemo(() => {
        const copy = [...locations];

        if (sortMode === 'name') {
            return copy.sort((left, right) => String(left.name).localeCompare(String(right.name)));
        }

        if (sortMode === 'emptiest') {
            return copy.sort((left, right) => {
                const countDiff = Number(left.toteCount || 0) - Number(right.toteCount || 0);
                if (countDiff !== 0) {
                    return countDiff;
                }

                return String(left.name).localeCompare(String(right.name));
            });
        }

        if (sortMode === 'fullest') {
            return copy.sort((left, right) => {
                const countDiff = Number(right.toteCount || 0) - Number(left.toteCount || 0);
                if (countDiff !== 0) {
                    return countDiff;
                }

                return String(left.name).localeCompare(String(right.name));
            });
        }

        return copy.sort((left, right) => {
            const typeDiff = typeSortIndex(left.itemType) - typeSortIndex(right.itemType);
            if (typeDiff !== 0) {
                return typeDiff;
            }

            return String(left.name).localeCompare(String(right.name));
        });
    }, [locations, sortMode]);

    const loadLocationTotes = useCallback(async (locationId) => {
        const response = await fetch(`${API_BASE}/api/staging-locations/${locationId}/totes`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Unable to load staged totes for this location.');
        }

        const payload = await response.json();
        const totes = Array.isArray(payload?.totes) ? payload.totes : [];
        setLocationTotesById((previous) => ({
            ...previous,
            [locationId]: totes
        }));
    }, [token]);

    const loadOrderTotesSummary = useCallback(async (orderId) => {
        const response = await fetch(`${API_BASE}/api/staging-locations/orders/${orderId}/totes-summary`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Unable to load order tote details.');
        }

        return response.json();
    }, [token]);

    const toggleExpandedLocation = async (location) => {
        const locationId = location.id;
        if (expandedLocationId === locationId) {
            setExpandedLocationId(null);
            return;
        }

        setExpandedLocationId(locationId);

        if (locationTotesById[locationId]) {
            return;
        }

        try {
            await loadLocationTotes(locationId);
        } catch (error) {
            console.error('Unable to load location totes', error);
            setErrorMessage(error.message || 'Unable to load location totes.');
        }
    };

    const handleCreateLocation = async ({ name, itemType }) => {
        setIsSubmitting(true);
        setDialogErrorMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/staging-locations`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, itemType })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to create staging location.');
            }

            setIsLocationFormOpen(false);
            await loadLocations();
        } catch (error) {
            setDialogErrorMessage(error.message || 'Unable to create staging location.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveOptions = async (event) => {
        event.preventDefault();

        const parsedLimit = Number(limitDraft);
        if (!Number.isInteger(parsedLimit)) {
            setDialogErrorMessage('Limit must be a whole number.');
            return;
        }

        setIsSubmitting(true);
        setDialogErrorMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/staging-locations/options`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ stagingLimit: parsedLimit })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to update location options.');
            }

            setIsOptionsOpen(false);
            await loadLocations();
        } catch (error) {
            setDialogErrorMessage(error.message || 'Unable to update location options.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openLocationEdit = (location) => {
        if (!isAdmin) {
            return;
        }

        setDialogErrorMessage('');
        setSelectedLocation(location);
        setLocationNameDraft(location.name || '');
        setLocationCodeDraft(location.locationCode || '');
        setIsLocationEditOpen(true);
    };

    const handleRenameLocation = async (event) => {
        event.preventDefault();

        if (!selectedLocation) {
            return;
        }

        setIsSubmitting(true);
        setDialogErrorMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/staging-locations/${selectedLocation.id}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: locationNameDraft,
                    locationCode: locationCodeDraft
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to rename location.');
            }

            setIsLocationEditOpen(false);
            setSelectedLocation(null);
            await loadLocations();
        } catch (error) {
            setDialogErrorMessage(error.message || 'Unable to rename location.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteLocation = async () => {
        if (!selectedLocation) {
            return;
        }

        setIsSubmitting(true);
        setDialogErrorMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/staging-locations/${selectedLocation.id}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to delete location.');
            }

            setIsLocationEditOpen(false);
            setSelectedLocation(null);
            setExpandedLocationId(null);
            setLocationTotesById((previous) => {
                const next = { ...previous };
                delete next[selectedLocation.id];
                return next;
            });
            await loadLocations();
        } catch (error) {
            setDialogErrorMessage(error.message || 'Unable to delete location.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemoveLocationCode = async () => {
        if (!selectedLocation) {
            return;
        }

        setIsSubmitting(true);
        setDialogErrorMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/staging-locations/${selectedLocation.id}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: locationNameDraft,
                    locationCode: ''
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to remove location code.');
            }

            setLocationCodeDraft('');
            await loadLocations();
        } catch (error) {
            setDialogErrorMessage(error.message || 'Unable to remove location code.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenOrderTotesModal = async (tote) => {
        if (!tote?.orderId) {
            return;
        }

        setDialogErrorMessage('');
        setSelectedTote(tote);
        setOrderTotesSummary(null);
        setIsOrderTotesModalOpen(true);
        setIsOrderTotesLoading(true);

        try {
            const payload = await loadOrderTotesSummary(tote.orderId);
            setOrderTotesSummary(payload);
        } catch (error) {
            setDialogErrorMessage(error.message || 'Unable to load order tote details.');
        } finally {
            setIsOrderTotesLoading(false);
        }
    };

    const handleUnstageOrderTote = async (orderId, commodity) => {
        const key = buildOrderToteKey(orderId, commodity);
        setDialogErrorMessage('');
        setUpdatingOrderToteKey(key);

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
                throw new Error(payload.message || 'Unable to unstage this tote.');
            }

            await loadLocations();
            if (expandedLocationId) {
                await loadLocationTotes(expandedLocationId);
            }

            const payload = await loadOrderTotesSummary(orderId);
            setOrderTotesSummary(payload);
        } catch (error) {
            setDialogErrorMessage(error.message || 'Unable to unstage this tote.');
        } finally {
            setUpdatingOrderToteKey('');
        }
    };

    const closeOrderTotesModal = () => {
        setIsOrderTotesModalOpen(false);
        setSelectedTote(null);
        setOrderTotesSummary(null);
        setUpdatingOrderToteKey('');
    };

    const jumpToCommodityInQueue = (orderId, commodity) => {
        navigate('/staging', {
            state: {
                focusOrderId: orderId,
                focusCommodity: commodity
            }
        });
    };

    useEffect(() => {
        if (!isCodeScannerOpen || !codeScannerVideoRef.current || !codeScannerStreamRef.current || !codeScannerDetectorRef.current) {
            return undefined;
        }

        const video = codeScannerVideoRef.current;
        video.srcObject = codeScannerStreamRef.current;

        const startScanning = async () => {
            try {
                await video.play();
            } catch (error) {
                console.error('Unable to start code scanner preview', error);
                closeCodeScannerModal();
                setCodeScannerMessage('Camera unavailable');
                return;
            }

            const scan = async () => {
                if (!codeScannerDetectorRef.current || !codeScannerVideoRef.current || codeScannerHandlingRef.current) {
                    codeScannerFrameRef.current = window.requestAnimationFrame(scan);
                    return;
                }

                try {
                    const barcodes = await codeScannerDetectorRef.current.detect(codeScannerVideoRef.current);
                    if (Array.isArray(barcodes) && barcodes.length > 0) {
                        const rawValue = normalizeScannedCode(barcodes[0]?.rawValue);
                        if (rawValue) {
                            codeScannerHandlingRef.current = true;
                            setLocationCodeDraft(rawValue);
                            closeCodeScannerModal();
                            codeScannerHandlingRef.current = false;
                            return;
                        }
                    }
                } catch (error) {
                    console.error('Location code scan failed', error);
                }

                codeScannerFrameRef.current = window.requestAnimationFrame(scan);
            };

            codeScannerFrameRef.current = window.requestAnimationFrame(scan);
        };

        startScanning();

        return () => {
            stopCodeScannerSession();
        };
    // Effect depends on camera open state and refs managed by scanner helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCodeScannerOpen]);

    useEffect(() => () => {
        stopCodeScannerSession();
    }, []);

    return (
        <div className="staging-locations-page">
            <TopBar
                title="Staging Locations"
                theme="red"
                leftActionLabel="<"
                leftActionAriaLabel="Back to staging"
                onLeftAction={() => navigate('/staging')}
            />

            <main className="staging-locations-content">
                <section className="staging-locations-controls">
                    {isAdmin ? (
                        <button
                            type="button"
                            className="staging-control-btn staging-control-btn--blue"
                            onClick={() => {
                                setDialogErrorMessage('');
                                setIsLocationFormOpen(true);
                            }}
                        >
                            New Location
                        </button>
                    ) : null}
                    {isAdmin ? (
                        <button
                            type="button"
                            className="staging-control-btn staging-control-btn--blue"
                            onClick={() => {
                                setDialogErrorMessage('');
                                setLimitDraft(String(currentLimit));
                                setIsOptionsOpen(true);
                            }}
                        >
                            Options
                        </button>
                    ) : null}
                    <select
                        className="staging-sort-select"
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value)}
                    >
                        <option value="type-name">Type then Name</option>
                        <option value="name">Name</option>
                        <option value="emptiest">Emptiest First</option>
                        <option value="fullest">Fullest First</option>
                    </select>
                </section>

                {errorMessage ? (
                    <section className="staging-locations-empty staging-locations-empty--error">
                        <h2>Unable to load staging locations</h2>
                        <p>{errorMessage}</p>
                    </section>
                ) : null}

                {!errorMessage && isLoading ? (
                    <section className="staging-locations-empty">
                        <h2>Loading locations...</h2>
                    </section>
                ) : null}

                {!errorMessage && !isLoading && sortedLocations.length === 0 ? (
                    <section className="staging-locations-empty">
                        <h2>No staging locations created yet.</h2>
                        <p>Use New Location to begin.</p>
                    </section>
                ) : null}

                {!errorMessage && !isLoading && sortedLocations.length > 0 ? (
                    <section className="staging-locations-list" aria-label="Staging locations">
                        {sortedLocations.map((location) => {
                            const locationTotes = locationTotesById[location.id] || [];
                            const isExpanded = expandedLocationId === location.id;
                            const toteCount = Number(location.toteCount || 0);

                            return (
                                <article key={location.id} className="staging-location-card">
                                    <div className="staging-location-row">
                                        <button
                                            type="button"
                                            className={`staging-location-main staging-location-main--${location.itemType}`}
                                            onClick={() => openLocationEdit(location)}
                                        >
                                            <span className="staging-location-name">{location.name}</span>
                                            <span className="staging-location-type">{ITEM_TYPE_LABELS[location.itemType] || location.itemType}</span>
                                        </button>

                                        <button
                                            type="button"
                                            className="staging-location-capacity"
                                            onClick={() => toggleExpandedLocation(location)}
                                            aria-expanded={isExpanded}
                                            aria-controls={`location-totes-${location.id}`}
                                        >
                                            {toteCount}/{currentLimit}
                                        </button>
                                    </div>

                                    {isExpanded ? (
                                        <div id={`location-totes-${location.id}`} className="staging-location-totes">
                                            {locationTotes.length === 0 ? (
                                                <p className="staging-location-totes-empty">No totes currently staged here.</p>
                                            ) : (
                                                locationTotes.map((tote) => (
                                                    <button
                                                        key={tote.id}
                                                        type="button"
                                                        className="staging-location-tote-row"
                                                        onClick={() => handleOpenOrderTotesModal(tote)}
                                                    >
                                                        <p>
                                                            {tote.customerName} - Order {tote.orderNumber}
                                                        </p>
                                                        <p>
                                                            {tote.commodityLabel} - Due {formatDueTime(tote.scheduledPickupTime)}
                                                        </p>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    ) : null}
                                </article>
                            );
                        })}
                    </section>
                ) : null}
            </main>

            <StagingLocationForm
                isOpen={isLocationFormOpen}
                onClose={() => setIsLocationFormOpen(false)}
                onSubmit={handleCreateLocation}
                isSubmitting={isSubmitting}
                errorMessage={dialogErrorMessage}
            />

            {isOptionsOpen ? (
                <div className="staging-modal-backdrop" role="presentation" onClick={() => setIsOptionsOpen(false)}>
                    <section className="staging-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Location Limit</h2>
                        <form className="staging-modal-form" onSubmit={handleSaveOptions}>
                            <label htmlFor="location-limit-input">Limit per location</label>
                            <input
                                id="location-limit-input"
                                type="number"
                                value={limitDraft}
                                onChange={(event) => setLimitDraft(event.target.value)}
                                min={minimumAllowedLimit}
                                max={50}
                                required
                            />
                            <p className="staging-options-help">
                                Minimum: {minimumAllowedLimit} (based on currently staged totes). Maximum: 50.
                            </p>
                            {dialogErrorMessage ? <p className="staging-modal-error">{dialogErrorMessage}</p> : null}
                            <div className="staging-modal-actions">
                                <button type="button" className="staging-modal-btn staging-modal-btn--ghost" onClick={() => setIsOptionsOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="staging-modal-btn staging-modal-btn--primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            ) : null}

            {isLocationEditOpen && selectedLocation ? (
                <div className="staging-modal-backdrop" role="presentation" onClick={() => setIsLocationEditOpen(false)}>
                    <section className="staging-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Edit Location</h2>
                        <form className="staging-modal-form" onSubmit={handleRenameLocation}>
                            <label htmlFor="location-rename-input">Name</label>
                            <input
                                id="location-rename-input"
                                type="text"
                                value={locationNameDraft}
                                onChange={(event) => setLocationNameDraft(event.target.value)}
                                maxLength={60}
                                required
                            />

                            <label>Item Type</label>
                            <input type="text" value={ITEM_TYPE_LABELS[selectedLocation.itemType] || selectedLocation.itemType} disabled />

                            <label htmlFor="location-code-input">Location Code</label>
                            <input
                                id="location-code-input"
                                type="text"
                                value={locationCodeDraft}
                                onChange={(event) => setLocationCodeDraft(event.target.value)}
                                maxLength={120}
                                placeholder="Unlocked when blank"
                            />
                            <div className="staging-modal-actions">
                                <button
                                    type="button"
                                    className="staging-modal-btn staging-modal-btn--ghost"
                                    disabled={isSubmitting}
                                    onClick={handleOpenCodeScanner}
                                >
                                    Scan Code
                                </button>
                                <button
                                    type="button"
                                    className="staging-modal-btn staging-modal-btn--danger"
                                    disabled={isSubmitting || !locationCodeDraft.trim()}
                                    onClick={handleRemoveLocationCode}
                                >
                                    Delete Code
                                </button>
                            </div>
                            {codeScannerMessage ? <p className="staging-modal-error">{codeScannerMessage}</p> : null}

                            {dialogErrorMessage ? <p className="staging-modal-error">{dialogErrorMessage}</p> : null}
                            <div className="staging-modal-actions">
                                <button
                                    type="button"
                                    className="staging-modal-btn staging-modal-btn--danger"
                                    disabled={isSubmitting || Number(selectedLocation.toteCount || 0) > 0}
                                    onClick={handleDeleteLocation}
                                >
                                    Delete
                                </button>
                                <button
                                    type="button"
                                    className="staging-modal-btn staging-modal-btn--ghost"
                                    onClick={() => setIsLocationEditOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="staging-modal-btn staging-modal-btn--primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                            {Number(selectedLocation.toteCount || 0) > 0 ? (
                                <p className="staging-options-help">Location can only be deleted when staged tote count is 0.</p>
                            ) : null}
                        </form>
                    </section>
                </div>
            ) : null}

            {isOrderTotesModalOpen ? (
                <div className="staging-modal-backdrop" role="presentation" onClick={closeOrderTotesModal}>
                    <section className="staging-modal-card staging-modal-card--wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Order Tote Details</h2>

                        {selectedTote ? (
                            <p className="staging-options-help">
                                Selected Tote Type: {selectedTote.commodityLabel}
                            </p>
                        ) : null}

                        {isOrderTotesLoading ? <p className="staging-options-help">Loading order totes...</p> : null}
                        {!isOrderTotesLoading && dialogErrorMessage ? <p className="staging-modal-error">{dialogErrorMessage}</p> : null}

                        {!isOrderTotesLoading && orderTotesSummary?.order ? (
                            <div className="staging-order-totes-summary">
                                <p>
                                    <strong>{orderTotesSummary.order.customerName}</strong>
                                </p>
                                <p>Order {orderTotesSummary.order.orderNumber || `#${orderTotesSummary.order.id}`}</p>

                                <div className="staging-order-totes-list">
                                    {(orderTotesSummary.totes || []).map((orderTote) => (
                                        <div key={`${orderTotesSummary.order.id}-${orderTote.commodity}`} className="staging-order-tote-item">
                                            <div>
                                                <p className="staging-order-tote-type">{orderTote.commodityLabel}</p>
                                                {orderTote.stagingLocation?.name ? (
                                                    <p className="staging-order-tote-location">Location: {orderTote.stagingLocation.name}</p>
                                                ) : null}
                                            </div>

                                            <div className="staging-order-tote-actions">
                                                <span className={`staging-group-status ${getModalStatusFlagClass(orderTote.status)}`}>
                                                    {getModalStatusLabel(orderTote.status)}
                                                </span>
                                                {orderTote.status === 'staged' ? (
                                                    <button
                                                        type="button"
                                                        className="staging-action-btn"
                                                        disabled={updatingOrderToteKey === buildOrderToteKey(orderTotesSummary.order.id, orderTote.commodity)}
                                                        onClick={() => handleUnstageOrderTote(orderTotesSummary.order.id, orderTote.commodity)}
                                                    >
                                                        {updatingOrderToteKey === buildOrderToteKey(orderTotesSummary.order.id, orderTote.commodity) ? 'Working...' : 'Unstage'}
                                                    </button>
                                                ) : null}
                                                {orderTote.status === 'unstaged' ? (
                                                    <button
                                                        type="button"
                                                        className="staging-action-btn"
                                                        onClick={() => jumpToCommodityInQueue(orderTotesSummary.order.id, orderTote.commodity)}
                                                    >
                                                        Go To Queue
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="staging-modal-actions">
                            <button type="button" className="staging-modal-btn staging-modal-btn--ghost" onClick={closeOrderTotesModal}>
                                Close
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {isCodeScannerOpen ? (
                <div className="staging-modal-backdrop" role="presentation" onClick={closeCodeScannerModal}>
                    <section className="staging-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Scan Location Code</h2>
                        <video ref={codeScannerVideoRef} className="staging-code-scanner-video" autoPlay playsInline muted />
                        <div className="staging-modal-actions">
                            <button type="button" className="staging-modal-btn staging-modal-btn--ghost" onClick={closeCodeScannerModal}>
                                Cancel
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            <Navbar />
        </div>
    );
};

export default StagingLocationsPage;

