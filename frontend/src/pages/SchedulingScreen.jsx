import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CustomerPopupMenu from '../components/customer/CustomerPopupMenu';
import './SchedulingScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const CLOSE_ANIMATION_MS = 280;
const SLOTS_PER_HOUR_CAPACITY = 20;
const START_HOUR = 8;
const END_HOUR = 23;
const MAX_DAYS_AHEAD = 7;

const pad = (value) => `${value}`.padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const getDayLabel = (date) => date.toLocaleDateString([], {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric'
});

const formatDateHeading = (dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
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

const createSlotDate = (dateKey, hour) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day, hour, 0, 0, 0);
};

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const SchedulingScreen = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const [firstName, setFirstName] = useState('Customer');
    const [customerId, setCustomerId] = useState(null);
    const [storeId, setStoreId] = useState(null);
    const [cartItems, setCartItems] = useState([]);
    const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
    const [selectedSlotKey, setSelectedSlotKey] = useState('');
    const [slotMetaByKey, setSlotMetaByKey] = useState({});
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

                const now = new Date();
                const end = new Date(now);
                end.setDate(end.getDate() + MAX_DAYS_AHEAD);
                const timezoneOffsetMinutes = now.getTimezoneOffset();

                const slotsResponse = await fetch(
                    `${API_BASE}/api/orders/scheduling/slots/${resolvedStoreId}?startDate=${toDateKey(now)}&endDate=${toDateKey(end)}&timezoneOffsetMinutes=${timezoneOffsetMinutes}`,
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

                const nextMeta = incomingSlots.reduce((accumulator, slot) => {
                    const slotTime = new Date(slot?.time);
                    if (Number.isNaN(slotTime.getTime())) {
                        return accumulator;
                    }

                    const key = `${toDateKey(slotTime)}-${slotTime.getHours()}`;
                    accumulator[key] = {
                        ordersScheduled: Number(slot?.ordersScheduled || 0),
                        capacity: Number(slot?.capacity || SLOTS_PER_HOUR_CAPACITY)
                    };

                    return accumulator;
                }, {});

                setSlotMetaByKey(nextMeta);
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
        const days = [];
        const today = new Date();

        for (let offset = 0; offset <= MAX_DAYS_AHEAD; offset += 1) {
            const date = new Date(today);
            date.setDate(today.getDate() + offset);
            days.push({
                key: toDateKey(date),
                label: getDayLabel(date)
            });
        }

        return days;
    }, []);

    const slotsForSelectedDate = useMemo(() => {
        const now = new Date();
        const todayKey = toDateKey(now);
        const minimumAllowedTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);

        const allSlots = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => {
            const hour = START_HOUR + index;
            const slotDate = createSlotDate(selectedDate, hour);
            const key = `${selectedDate}-${hour}`;
            const slotMeta = slotMetaByKey[key] || {};
            const ordersScheduled = Number(slotMeta?.ordersScheduled || 0);
            const capacity = Number(slotMeta?.capacity || SLOTS_PER_HOUR_CAPACITY);
            const isFull = ordersScheduled >= capacity;
            const lessThanThreeHoursOut = slotDate.getTime() < minimumAllowedTime.getTime();
            const isUnavailable = isFull || lessThanThreeHoursOut;

            return {
                key,
                hour,
                slotDate,
                ordersScheduled,
                capacity,
                isUnavailable,
                isSelected: selectedSlotKey === key
            };
        });

        return allSlots.filter((slot) => {
            if (selectedDate === todayKey && slot.slotDate.getTime() < now.getTime()) {
                return false;
            }
            return true;
        });
    }, [selectedDate, selectedSlotKey, slotMetaByKey]);

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
                    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
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

                <h2 className="schedule-screen__date-heading">{formatDateHeading(selectedDate)}</h2>

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
