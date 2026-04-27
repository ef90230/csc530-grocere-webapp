import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './DispensePage.css';

const API_BASE = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const getLocationTag = (tote) => {
    const location = tote?.stagingLocation;
    if (!location?.name) {
        return 'Unknown';
    }

    if (location.itemType === 'ambient') {
        return location.name;
    }

    return location.name;
};

const resolveDisplayItem = (orderItem) => {
    const status = normalizeStatus(orderItem?.status);
    const isSubstitute = status === 'substituted' && orderItem?.substitutedItem;

    if (isSubstitute) {
        return {
            isSubstitute: true,
            name: orderItem?.substitutedItem?.name || orderItem?.item?.name || 'Item',
            upc: orderItem?.substitutedItem?.upc || orderItem?.item?.upc || '',
            price: toNumber(orderItem?.substitutedItem?.price)
        };
    }

    return {
        isSubstitute: false,
        name: orderItem?.item?.name || 'Item',
        upc: orderItem?.item?.upc || '',
        price: toNumber(orderItem?.item?.price)
    };
};

const buildCancellationDelta = (orderItems) => {
    const rows = Array.isArray(orderItems) ? orderItems : [];

    return rows.reduce((accumulator, item) => {
        const itemId = String(item?.id || '');
        if (!itemId) {
            return accumulator;
        }

        accumulator[itemId] = {
            originalPickedQuantity: Math.max(0, Math.round(toNumber(item?.pickedQuantity))),
            removedQuantity: 0
        };
        return accumulator;
    }, {});
};

const applyCancellation = (deltaRow, removeQty) => {
    const originalPicked = Math.max(0, Math.round(toNumber(deltaRow?.originalPickedQuantity)));
    const nextRemoved = Math.max(0, Math.min(originalPicked, Math.round(toNumber(deltaRow?.removedQuantity)) + removeQty));

    return {
        originalPickedQuantity: originalPicked,
        removedQuantity: nextRemoved
    };
};

const getEffectivePickedQty = (deltaRow) => {
    const originalPicked = Math.max(0, Math.round(toNumber(deltaRow?.originalPickedQuantity)));
    const removed = Math.max(0, Math.round(toNumber(deltaRow?.removedQuantity)));
    return Math.max(0, originalPicked - removed);
};

const DispensePage = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const token = window.localStorage.getItem('authToken');
    const orderId = toNumber(location.state?.orderId);
    const [order, setOrder] = useState(null);
    const [totes, setTotes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const [checkedToteKeys, setCheckedToteKeys] = useState({});
    const [step1Done, setStep1Done] = useState(false);
    const [step2Done, setStep2Done] = useState(false);
    const [step3Done, setStep3Done] = useState(false);
    const [isStep3ListOpen, setIsStep3ListOpen] = useState(false);

    const [cancellationDeltaByItemId, setCancellationDeltaByItemId] = useState({});
    const [isQuantityModalOpen, setIsQuantityModalOpen] = useState(false);
    const [quantityModalDraft, setQuantityModalDraft] = useState('1');
    const [activeItemForQuantityDialog, setActiveItemForQuantityDialog] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const userType = window.localStorage.getItem('userType');
        if (!token || (userType !== 'employee' && userType !== 'admin') || !orderId) {
            navigate('/orders');
        }
    }, [navigate, orderId, token]);

    useEffect(() => {
        const loadDispenseData = async () => {
            if (!token || !orderId) {
                return;
            }

            setIsLoading(true);
            setErrorMessage('');

            try {
                const [orderRes, toteSummaryRes] = await Promise.all([
                    fetch(`${API_BASE}/api/orders/${orderId}`, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }),
                    fetch(`${API_BASE}/api/staging-locations/orders/${orderId}/totes-summary`, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    })
                ]);

                if (!orderRes.ok) {
                    const payload = await orderRes.json().catch(() => ({}));
                    throw new Error(payload.message || 'Unable to load dispense order.');
                }

                if (!toteSummaryRes.ok) {
                    const payload = await toteSummaryRes.json().catch(() => ({}));
                    throw new Error(payload.message || 'Unable to load staged tote locations.');
                }

                const orderPayload = await orderRes.json();
                const totePayload = await toteSummaryRes.json();

                const nextOrder = orderPayload?.order || null;
                const nextTotes = Array.isArray(totePayload?.totes) ? totePayload.totes : [];

                setOrder(nextOrder);
                setTotes(nextTotes);
                setCancellationDeltaByItemId(buildCancellationDelta(nextOrder?.items));

                const allToteKeys = nextTotes.reduce((accumulator, tote, toteIndex) => {
                    const toteKey = `${tote?.commodity || 'unknown'}-${toteIndex}`;
                    accumulator[toteKey] = false;
                    return accumulator;
                }, {});
                setCheckedToteKeys(allToteKeys);
            } catch (error) {
                setErrorMessage(error.message || 'Unable to load dispense order.');
            } finally {
                setIsLoading(false);
            }
        };

        loadDispenseData();
    }, [orderId, token]);

    const customerName = useMemo(() => {
        const fromNav = String(location.state?.customerName || '').trim();
        if (fromNav) {
            return fromNav;
        }

        const first = order?.customer?.firstName || '';
        const last = order?.customer?.lastName || '';
        const full = `${first} ${last}`.trim();
        return full || 'Customer';
    }, [location.state?.customerName, order?.customer?.firstName, order?.customer?.lastName]);

    const orderNumber = useMemo(() => {
        return location.state?.orderNumber || order?.orderNumber || '';
    }, [location.state?.orderNumber, order?.orderNumber]);

    const parkingSpot = useMemo(() => {
        return location.state?.parkingSpot || order?.parkingSpot || '?';
    }, [location.state?.parkingSpot, order?.parkingSpot]);

    const substituteRows = useMemo(() => {
        const rows = Array.isArray(order?.items) ? order.items : [];
        return rows.filter((item) => normalizeStatus(item?.status) === 'substituted' && item?.substitutedItem);
    }, [order?.items]);

    const itemRows = useMemo(() => {
        const rows = Array.isArray(order?.items) ? order.items : [];

        return rows.map((item) => {
            const itemId = String(item?.id || '');
            const delta = cancellationDeltaByItemId[itemId] || {
                originalPickedQuantity: Math.max(0, Math.round(toNumber(item?.pickedQuantity))),
                removedQuantity: 0
            };
            const effectivePickedQuantity = getEffectivePickedQty(delta);
            const displayItem = resolveDisplayItem(item);

            return {
                id: item?.id,
                itemId,
                orderItem: item,
                displayItem,
                effectivePickedQuantity,
                isSubstitute: displayItem.isSubstitute,
                isDisabled: effectivePickedQuantity <= 0
            };
        });
    }, [cancellationDeltaByItemId, order?.items]);

    const canEditCancellations = step1Done && step2Done;
    const checkedToteCount = Object.values(checkedToteKeys).filter(Boolean).length;
    const totalToteCount = totes.length;
    const allTotesChecked = totalToteCount > 0 && checkedToteCount >= totalToteCount;

    const isStep2Enabled = step1Done;
    const isStep3Enabled = step1Done && step2Done;
    const isStep4Enabled = step1Done && step2Done && step3Done;

    const toggleToteChecked = (toteKey) => {
        setCheckedToteKeys((previous) => ({
            ...previous,
            [toteKey]: !previous[toteKey]
        }));
    };

    const handleStep1Done = () => {
        if (!allTotesChecked) {
            return;
        }
        setStep1Done(true);
    };

    const handleStep1NotDone = () => {
        setStep1Done(false);
        setStep2Done(false);
        setStep3Done(false);
        setIsStep3ListOpen(false);
    };

    const handleStep2Done = () => {
        if (!isStep2Enabled) {
            return;
        }
        setStep2Done(true);
    };

    const handleStep2NotDone = () => {
        setStep2Done(false);
        setStep3Done(false);
        setIsStep3ListOpen(false);
    };

    const handleOpenStep3Items = () => {
        setIsStep3ListOpen(true);
    };

    const handleConfirmStep3 = () => {
        setIsStep3ListOpen(false);
        setStep3Done(true);
    };

    const openCancelSomeDialog = (row) => {
        if (!row || row.isDisabled || !canEditCancellations) {
            return;
        }

        setActiveItemForQuantityDialog(row);
        setQuantityModalDraft('1');
        setIsQuantityModalOpen(true);
    };

    const closeCancelSomeDialog = () => {
        setIsQuantityModalOpen(false);
        setActiveItemForQuantityDialog(null);
        setQuantityModalDraft('1');
    };

    const applyCancelSome = () => {
        if (!activeItemForQuantityDialog?.itemId) {
            return;
        }

        const parsedQty = Math.max(1, Math.round(toNumber(quantityModalDraft)));
        const maxQty = Math.max(1, activeItemForQuantityDialog.effectivePickedQuantity);
        const removeQty = Math.min(parsedQty, maxQty);

        setCancellationDeltaByItemId((previous) => {
            const existing = previous[activeItemForQuantityDialog.itemId] || {
                originalPickedQuantity: activeItemForQuantityDialog.effectivePickedQuantity,
                removedQuantity: 0
            };

            return {
                ...previous,
                [activeItemForQuantityDialog.itemId]: applyCancellation(existing, removeQty)
            };
        });

        closeCancelSomeDialog();
    };

    const applyCancelAll = (row) => {
        if (!row?.itemId || row.isDisabled || !canEditCancellations) {
            return;
        }

        setCancellationDeltaByItemId((previous) => {
            const existing = previous[row.itemId] || {
                originalPickedQuantity: row.effectivePickedQuantity,
                removedQuantity: 0
            };
            const remaining = getEffectivePickedQty(existing);

            return {
                ...previous,
                [row.itemId]: applyCancellation(existing, remaining)
            };
        });
    };

    const persistItemCancellations = async () => {
        const itemUpdates = itemRows
            .map((row) => {
                const status = row.effectivePickedQuantity <= 0
                    ? 'skipped'
                    : (row.isSubstitute ? 'substituted' : 'found');

                return {
                    itemId: row.id,
                    pickedQuantity: row.effectivePickedQuantity,
                    status
                };
            })
            .filter((update) => Number.isInteger(Number(update.itemId)));

        for (const update of itemUpdates) {
            const response = await fetch(`${API_BASE}/api/orders/${orderId}/items/${update.itemId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: update.status,
                    pickedQuantity: update.pickedQuantity
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to save item changes.');
            }
        }
    };

    const handleCompleteOrder = async () => {
        if (!isStep4Enabled || !orderId) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage('');

        try {
            await persistItemCancellations();

            const statusRes = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'completed' })
            });

            if (!statusRes.ok) {
                const payload = await statusRes.json().catch(() => ({}));
                throw new Error(payload.message || 'Unable to complete order.');
            }

            navigate('/orders', {
                state: {
                    focusOrderId: orderId
                }
            });
        } catch (error) {
            setErrorMessage(error.message || 'Unable to complete order.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const step1ActionLabel = step1Done ? 'Mark Not Done' : (allTotesChecked ? 'Mark Done' : `${checkedToteCount}/${totalToteCount || 0}`);
    const step1ActionDisabled = step1Done ? false : !allTotesChecked;
    const step2ActionLabel = step2Done ? 'Mark Not Done' : 'Mark Done';
    const step2ActionDisabled = step2Done ? false : !isStep2Enabled;
    const step3ActionLabel = isStep3ListOpen ? 'Confirm' : (step3Done ? 'Make Changes' : 'Show Items');

    return (
        <div className="dispense-page">
            <TopBar
                title="Dispense"
                theme="purple"
                leftActionLabel="<"
                leftActionAriaLabel="Back to orders"
                onLeftAction={() => navigate('/orders')}
            />

            <main className="dispense-content">
                {isLoading ? <p className="dispense-message">Loading dispense workflow...</p> : null}
                {!isLoading && errorMessage ? <p className="dispense-message dispense-message--error">{errorMessage}</p> : null}

                {!isLoading && !errorMessage ? (
                    <>
                        <section className="dispense-order-header">
                            <h1>{customerName}</h1>
                            <p className="dispense-order-number">Order {orderNumber || `#${orderId}`}</p>
                            <div className="dispense-space-badge">
                                <span>SPACE</span>
                                <strong>{parkingSpot || '?'}</strong>
                            </div>
                        </section>

                        <section className={`dispense-step ${step1Done ? 'dispense-step--done' : 'dispense-step--active'}`}>
                            <div className="dispense-step-header-row">
                                <p>Get all totes. Remove totes from coolers and freezers and combine them to form the order.</p>
                                <button
                                    type="button"
                                    className={`dispense-step-action ${step1Done ? 'dispense-step-action--danger' : ''}`}
                                    disabled={step1ActionDisabled}
                                    onClick={step1Done ? handleStep1NotDone : handleStep1Done}
                                >
                                    {step1ActionLabel}
                                </button>
                            </div>

                            <div className="dispense-tote-list">
                                {totes.map((tote, index) => {
                                    const toteKey = `${tote?.commodity || 'unknown'}-${index}`;
                                    const isChecked = Boolean(checkedToteKeys[toteKey]);

                                    return (
                                        <button
                                            type="button"
                                            key={toteKey}
                                            className={`dispense-tote-row ${isChecked ? 'dispense-tote-row--checked' : ''}`}
                                            onClick={() => toggleToteChecked(toteKey)}
                                        >
                                            <span className="dispense-tote-check">{isChecked ? '\u2713' : ''}</span>
                                            <span className="dispense-tote-customer">{customerName}</span>
                                            <span className="dispense-tote-order">Order {orderNumber || `#${orderId}`}</span>
                                            <span className="dispense-tote-location">{getLocationTag(tote)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        <section className={`dispense-step ${step2Done ? 'dispense-step--done' : (isStep2Enabled ? 'dispense-step--active' : '')}`}>
                            <div className="dispense-step-header-row">
                                <p>Greet the customer and alert them of any substitutions.</p>
                                <button
                                    type="button"
                                    className={`dispense-step-action ${step2Done ? 'dispense-step-action--danger' : ''}`}
                                    disabled={step2ActionDisabled}
                                    onClick={step2Done ? handleStep2NotDone : handleStep2Done}
                                >
                                    {step2ActionLabel}
                                </button>
                            </div>

                            {substituteRows.length > 0 ? (
                                <ul className="dispense-sub-list">
                                    {substituteRows.map((row) => (
                                        <li key={row.id}>
                                            <span className="dispense-sub-pill">SUB</span>
                                            <span>{row?.substitutedItem?.name || row?.item?.name || 'Item'}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="dispense-note">This order has no substitutions.</p>
                            )}
                        </section>

                        <section className={`dispense-step ${isStep3Enabled ? 'dispense-step--active' : ''} ${isStep3ListOpen ? 'dispense-step--open' : ''}`}>
                            <div className="dispense-step-header-row">
                                <p>Ask the customer if they wish to cancel any items.</p>
                                <button
                                    type="button"
                                    className="dispense-step-action"
                                    onClick={isStep3ListOpen ? handleConfirmStep3 : handleOpenStep3Items}
                                >
                                    {step3ActionLabel}
                                </button>
                            </div>

                            {isStep3ListOpen ? (
                                <div className="dispense-item-list">
                                    {itemRows.map((row) => {
                                        const item = row.displayItem;

                                        return (
                                            <article
                                                key={row.itemId}
                                                className={`dispense-item-row ${row.isSubstitute ? 'dispense-item-row--sub' : ''} ${row.isDisabled ? 'dispense-item-row--disabled' : ''}`}
                                            >
                                                <div className="dispense-item-main">
                                                    <div className="dispense-item-name-row">
                                                        <strong>{item.name}</strong>
                                                        {row.isSubstitute ? <span className="dispense-sub-pill">SUB</span> : null}
                                                    </div>
                                                    <p>Quantity: {row.effectivePickedQuantity}</p>
                                                </div>

                                                <div className="dispense-item-meta">
                                                    <p>UPC: {item.upc || 'N/A'}</p>
                                                    <p>Price: ${item.price.toFixed(2)}</p>
                                                </div>

                                                <div className="dispense-item-actions">
                                                    {row.isDisabled ? null : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                disabled={!canEditCancellations}
                                                                onClick={() => openCancelSomeDialog(row)}
                                                            >
                                                                Cancel Some
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={!canEditCancellations}
                                                                onClick={() => applyCancelAll(row)}
                                                            >
                                                                Cancel All
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </section>

                        <section className={`dispense-step ${isStep4Enabled ? 'dispense-step--active' : ''}`}>
                            <div className="dispense-step-header-row">
                                <p>Load the order in the vehicle.</p>
                                <button
                                    type="button"
                                    className="dispense-step-action"
                                    disabled={!isStep4Enabled || isSubmitting}
                                    onClick={handleCompleteOrder}
                                >
                                    {isSubmitting ? 'Saving...' : 'Mark Done'}
                                </button>
                            </div>
                        </section>

                        {(isStep3ListOpen || isStep4Enabled) ? (
                            <section className="dispense-alert-box">
                                <h2>Alert</h2>
                                {isStep4Enabled ? (
                                    <p>Pressing 'Mark Done' now will complete the order and prevent you from making any more changes. Ensure everything is correct before proceeding.</p>
                                ) : (
                                    <p>Cancellation of any items cannot be undone once performed. Double-check you are removing the correct item.</p>
                                )}
                            </section>
                        ) : null}
                    </>
                ) : null}
            </main>

            {isQuantityModalOpen && activeItemForQuantityDialog ? (
                <div className="dispense-modal-backdrop" role="presentation" onClick={closeCancelSomeDialog}>
                    <section className="dispense-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <h2>Cancel Quantity</h2>
                        <p>How many units should be removed from this item?</p>
                        <input
                            type="number"
                            min={1}
                            max={Math.max(1, activeItemForQuantityDialog.effectivePickedQuantity)}
                            value={quantityModalDraft}
                            onChange={(event) => setQuantityModalDraft(event.target.value)}
                        />
                        <div className="dispense-modal-actions">
                            <button type="button" onClick={closeCancelSomeDialog}>Back</button>
                            <button type="button" onClick={applyCancelSome}>Confirm</button>
                        </div>
                    </section>
                </div>
            ) : null}

            <Navbar />
        </div>
    );
};

export default DispensePage;


