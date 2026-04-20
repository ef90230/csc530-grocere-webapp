import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CustomerPopupMenu from '../components/customer/CustomerPopupMenu';
import './SchedulingScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const CLOSE_ANIMATION_MS = 280;
const SLOTS_PER_HOUR_CAPACITY = 20;

const getDateFromKey = (dateKey) => {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
};

const getDayLabel = (dateKey) => getDateFromKey(dateKey).toLocaleDateString([], {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric'
});

const formatDateHeading = (dateKey) => {
    const date = getDateFromKey(dateKey);
    return date.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });
};

const formatHourLabel = (hour) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${normalizedHour}:00 ${period}`;
};

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const SchedulingScreen = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const [firstName, setFirstName] = useState('Customer');
    const [customerId, setCustomerId] = useState(null);
    const [storeId, setStoreId] = useState(null);
    const [cartItems, setCartItems] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedSlotKey, setSelectedSlotKey] = useState('');
    const [availableSlots, setAvailableSlots] = useState([]);
    const [storeTimeZone, setStoreTimeZone] = useState('UTC');
    const [isLoading, setIsLoading] = useState(true);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [isMenuClosing, setIsMenuClosing] = useState(false);
    const [isEstimatedTotalInfoOpen, setIsEstimatedTotalInfoOpen] = useState(false);

    useEffect(() => {
        if (!location.state?.fromCheckout) {
            navigate('/cart', { replace: true });
        }
    }, [location.state, navigate]);

    useEffect(() => {
        const token = localStorage.getItem('authToken');

        const loadScreen = async () => {
            if (!token) {
                navigate('/');
                return;
            }

            try {
                const profileResponse = await fetch(`${API_BASE}/api/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (!profileResponse.ok) {
                    navigate('/');
                    return;
                }

                const profilePayload = await profileResponse.json();
                const user = profilePayload?.user || {};
                const resolvedCustomerId = user?.id;

                if (!resolvedCustomerId) {
                    navigate('/cart', { replace: true });
                    return;
                }

                setFirstName(user?.firstName || 'Customer');
                setCustomerId(resolvedCustomerId);

                const cartResponse = await fetch(`${API_BASE}/api/cart/${resolvedCustomerId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (!cartResponse.ok) {
                    setErrorMessage('Unable to load cart. Please return to your cart and try again.');
                    return;
                }

                const cartPayload = await cartResponse.json();
                const resolvedCartItems = cartPayload?.cart?.items || [];
                const resolvedStoreId = cartPayload?.cart?.storeId || user?.preferredStoreId || null;

                setCartItems(resolvedCartItems);
                setStoreId(resolvedStoreId);

                if (!resolvedStoreId) {
                    setErrorMessage('No store selected for this order yet.');
                    return;
                }

                const slotsResponse = await fetch(
                    `${API_BASE}/api/orders/scheduling/slots/${resolvedStoreId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                );

                if (!slotsResponse.ok) {
                    setErrorMessage('Unable to load scheduling slots right now.');
                    return;
                }

                const slotsPayload = await slotsResponse.json();
                const incomingSlots = slotsPayload?.slots || [];

                const normalizedSlots = incomingSlots
                    .map((slot) => {
                        const slotTime = new Date(slot?.time);
                        const slotDateKey = String(slot?.date || '');
                        const slotHour = Number(slot?.hour);

                        if (!slotDateKey || Number.isNaN(slotTime.getTime()) || !Number.isInteger(slotHour)) {
                            return null;
                        }

                        return {
                            key: `${slotDateKey}-${slotHour}`,
                            date: slotDateKey,
                            hour: slotHour,
                            slotDate: slotTime,
                            ordersScheduled: Number(slot?.ordersScheduled || 0),
                            capacity: Number(slot?.capacity || SLOTS_PER_HOUR_CAPACITY),
                            isAvailable: Boolean(slot?.isAvailable)
                        };
                    })
                    .filter(Boolean)
                    .sort((left, right) => left.slotDate.getTime() - right.slotDate.getTime());

                setAvailableSlots(normalizedSlots);
                setStoreTimeZone(String(slotsPayload?.timeZone || 'UTC'));
                setSelectedDate((previousDate) => {
                    if (previousDate && normalizedSlots.some((slot) => slot.date === previousDate)) {
                        return previousDate;
                    }

                    return normalizedSlots[0]?.date || '';
                });
            } catch {
                setErrorMessage('Unable to load scheduling information. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };

        loadScreen();
    }, [navigate]);

    useEffect(() => {
        if (!isMenuClosing) {
            return undefined;
        }

        const timeoutId = setTimeout(() => {
            setIsMenuVisible(false);
            setIsMenuClosing(false);
        }, CLOSE_ANIMATION_MS);

        return () => clearTimeout(timeoutId);
    }, [isMenuClosing]);

    const dayOptions = useMemo(() => {
        return Array.from(new Set(availableSlots.map((slot) => slot.date))).map((dateKey) => ({
            key: dateKey,
            label: getDayLabel(dateKey)
        }));
    }, [availableSlots]);

    const slotsForSelectedDate = useMemo(() => {
        return availableSlots
            .filter((slot) => slot.date === selectedDate)
            .map((slot) => ({
                ...slot,
                isUnavailable: !slot.isAvailable,
                isSelected: selectedSlotKey === slot.key
            }));
    }, [availableSlots, selectedDate, selectedSlotKey]);

    const estimatedTotal = useMemo(() => (
        cartItems.reduce((sum, cartItem) => {
            const unitPrice = Number(cartItem?.item?.price || 0);
            const quantity = Number(cartItem?.quantity || 0);
            return sum + (unitPrice * quantity);
        }, 0)
    ), [cartItems]);

    const selectedSlot = useMemo(() => (
        slotsForSelectedDate.find((slot) => slot.key === selectedSlotKey) || null
    ), [selectedSlotKey, slotsForSelectedDate]);

    const openMenu = () => {
        setIsMenuClosing(false);
        setIsMenuVisible(true);
    };

    const closeMenu = () => {
        if (!isMenuVisible) {
            return;
        }

        setIsMenuClosing(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userType');
        localStorage.removeItem('userDisplayName');
        closeMenu();
        setTimeout(() => {
            navigate('/');
        }, CLOSE_ANIMATION_MS);
    };

    const handlePlaceOrder = async () => {
        if (!selectedSlot || selectedSlot.isUnavailable) {
            setErrorMessage('Select an available timeslot before placing your order.');
            return;
        }

        if (!customerId || !storeId) {
            setErrorMessage('Missing customer or store information.');
            return;
        }

        if (!cartItems.length) {
            setErrorMessage('Your cart is empty. Return to your cart to add items.');
            return;
        }

        const token = localStorage.getItem('authToken');
        if (!token) {
            navigate('/');
            return;
        }

        setIsPlacingOrder(true);
        setErrorMessage('');

        try {
            const createResponse = await fetch(`${API_BASE}/api/orders`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    customerId,
                    storeId,
                    scheduledPickupTime: selectedSlot.slotDate.toISOString(),
                    items: cartItems
                        .filter((cartItem) => cartItem?.item?.id)
                        .map((cartItem) => ({
                            itemId: cartItem.item.id,
                            quantity: Number(cartItem.quantity || 1),
                            notes: cartItem?.notes || null,
                            substitutionItemId: cartItem?.substitutionItemId || null,
                            substitutionQuantity: cartItem?.substitutionQuantity || null
                        }))
                })
            });

            const createPayload = await createResponse.json().catch(() => ({}));
            if (!createResponse.ok || !createPayload?.success) {
                const backendError = Array.isArray(createPayload?.errors) && createPayload.errors.length
                    ? createPayload.errors.join(' ')
                    : createPayload?.message;

                setErrorMessage(backendError || 'Unable to place order for the selected timeslot.');
                return;
            }

            const clearCartResponse = await fetch(`${API_BASE}/api/cart/${customerId}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!clearCartResponse.ok) {
                setErrorMessage('Order placed, but cart could not be cleared automatically.');
                return;
            }

            navigate('/storefront');
        } catch {
            setErrorMessage('Unable to place order right now. Please try again.');
        } finally {
            setIsPlacingOrder(false);
        }
    };

    return (
        <div className="schedule-screen">
            <header className="schedule-screen__topbar">
                <span className="schedule-screen__welcome">Hello, {firstName}!</span>
                <button
                    type="button"
                    className="schedule-screen__menu-button"
                    aria-label="Open menu"
                    onClick={openMenu}
                >
                    ☰
                </button>
            </header>

            <main className="schedule-screen__content">
                <section className="schedule-screen__header-row">
                    <h1 className="schedule-screen__title">Schedule Your Order</h1>
                    <button
                        type="button"
                        className="schedule-screen__back-button"
                        onClick={() => navigate('/cart')}
                    >
                        Back
                    </button>
                </section>

                <p className="schedule-screen__status">Scheduling time zone: {storeTimeZone}</p>

                <section className="schedule-screen__day-picker" aria-label="Available days">
                    {dayOptions.map((day) => (
                        <button
                            key={day.key}
                            type="button"
                            className={`schedule-screen__day-button ${selectedDate === day.key ? 'schedule-screen__day-button--active' : ''}`}
                            onClick={() => {
                                setSelectedDate(day.key);
                                setSelectedSlotKey('');
                            }}
                        >
                            {day.label}
                        </button>
                    ))}
                </section>

                {selectedDate ? <h2 className="schedule-screen__date-heading">{formatDateHeading(selectedDate)}</h2> : null}

                {isLoading && <p className="schedule-screen__status">Loading schedule...</p>}

                {!isLoading && (
                    <section className="schedule-screen__slots" aria-live="polite">
                        {slotsForSelectedDate.map((slot) => (
                            <article key={slot.key} className="schedule-slot-card">
                                <span className="schedule-slot-card__time">{formatHourLabel(slot.hour)}</span>
                                <span className="schedule-slot-card__capacity">
                                    {slot.ordersScheduled}/{slot.capacity}
                                </span>
                                <button
                                    type="button"
                                    className={`schedule-slot-card__button ${slot.isSelected ? 'schedule-slot-card__button--selected' : ''}`}
                                    disabled={slot.isUnavailable}
                                    onClick={() => {
                                        setErrorMessage('');
                                        setSelectedSlotKey(slot.key);
                                    }}
                                >
                                    {slot.isUnavailable ? 'Unavailable' : slot.isSelected ? 'Selected' : 'Select'}
                                </button>
                            </article>
                        ))}
                    </section>
                )}

                {errorMessage && <p className="schedule-screen__error">{errorMessage}</p>}

                <footer className="schedule-screen__footer">
                    <div>
                        <p className="schedule-screen__total-label">
                            ESTIMATED TOTAL
                            <button
                                type="button"
                                className="schedule-screen__info-button"
                                aria-label="Estimated total information"
                                onClick={() => setIsEstimatedTotalInfoOpen(true)}
                            >
                                i
                            </button>
                        </p>
                        <p className="schedule-screen__total-value">{formatCurrency(estimatedTotal)}</p>
                    </div>
                    <button
                        type="button"
                        className="schedule-screen__place-order-button"
                        disabled={isPlacingOrder || !selectedSlot || selectedSlot.isUnavailable || cartItems.length === 0 || isLoading}
                        onClick={handlePlaceOrder}
                    >
                        {isPlacingOrder ? 'Placing...' : 'Place Order'}
                    </button>
                </footer>
            </main>

            {(isMenuVisible || isMenuClosing) && (
                <CustomerPopupMenu
                    isClosing={isMenuClosing}
                    onClose={closeMenu}
                    onLogout={handleLogout}
                    onNavigate={(path) => {
                        closeMenu();
                        setTimeout(() => {
                            navigate(path);
                        }, CLOSE_ANIMATION_MS);
                    }}
                />
            )}

            {isEstimatedTotalInfoOpen && (
                <div className="cart-info-overlay" onClick={() => setIsEstimatedTotalInfoOpen(false)}>
                    <div className="cart-info-overlay-hint">Click anywhere outside this card to close this menu</div>
                    <section className="cart-info-card" onClick={(event) => event.stopPropagation()}>
                        <h2>Note About Estimated Totals:</h2>
                        <p>
                            This total is based on the unit prices of the items you selected. This total is
                            subject to change based on the weight of any items priced by the pound. Additionally,
                            if you allow substitutions for this order and any substitutions are made, your final
                            total will reflect the price of those substitutions. You will not be charged for any
                            items that are not picked.
                        </p>
                    </section>
                </div>
            )}
        </div>
    );
};

export default SchedulingScreen;
