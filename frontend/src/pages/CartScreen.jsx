import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerPopupMenu from '../components/customer/CustomerPopupMenu';
import './CartScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');
const CLOSE_ANIMATION_MS = 280;

const CartScreen = () => {
    const navigate = useNavigate();
    const [firstName, setFirstName] = useState('Welcome');
    const [customerId, setCustomerId] = useState(null);
    const [cartItems, setCartItems] = useState([]);
    const [cartStoreId, setCartStoreId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isClearingCart, setIsClearingCart] = useState(false);
    const [updatingItemId, setUpdatingItemId] = useState(null);
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [isMenuClosing, setIsMenuClosing] = useState(false);
    const [isEstimatedTotalInfoOpen, setIsEstimatedTotalInfoOpen] = useState(false);
    const [isEmptyCartConfirmOpen, setIsEmptyCartConfirmOpen] = useState(false);
    const [itemOptionsState, setItemOptionsState] = useState(null);
    const [substitutionItems, setSubstitutionItems] = useState([]);
    const [substitutionSearch, setSubstitutionSearch] = useState('');
    const [isLoadingSubstitutions, setIsLoadingSubstitutions] = useState(false);
    const [substitutionQuantities, setSubstitutionQuantities] = useState({});
    const [specialInstructionsDraft, setSpecialInstructionsDraft] = useState('');
    const [itemOptionsError, setItemOptionsError] = useState('');

    const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

    const loadCart = useCallback(async (resolvedCustomerId) => {
        const token = localStorage.getItem('authToken');

        if (!token || !resolvedCustomerId) {
            setCartItems([]);
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/cart/${resolvedCustomerId}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            const items = payload?.cart?.items || [];
            setCartItems(items);
            setCartStoreId(payload?.cart?.storeId || null);
        } catch {
            setCartItems([]);
            setCartStoreId(null);
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('authToken');

        const loadScreen = async () => {
            if (!token) {
                navigate('/');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/api/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    navigate('/');
                    return;
                }

                const payload = await response.json();
                const user = payload?.user || {};
                const resolvedCustomerId = user?.id;

                if (!resolvedCustomerId) {
                    navigate('/storefront');
                    return;
                }

                if (user?.firstName) {
                    setFirstName(user.firstName);
                }

                setCustomerId(resolvedCustomerId);
                await loadCart(resolvedCustomerId);
            } catch {
                navigate('/storefront');
            } finally {
                setIsLoading(false);
            }
        };

        loadScreen();
    }, [loadCart, navigate]);

    const estimatedTotal = useMemo(() => (
        cartItems.reduce((sum, cartItem) => {
            const unitPrice = Number(cartItem?.item?.price || 0);
            const quantity = Number(cartItem?.quantity || 0);
            return sum + (unitPrice * quantity);
        }, 0)
    ), [cartItems]);

    const updateItemQuantity = async (cartItemId, quantity) => {
        const token = localStorage.getItem('authToken');

        if (!token || !customerId || !cartItemId || quantity < 1) {
            return;
        }

        setUpdatingItemId(cartItemId);

        try {
            const response = await fetch(`${API_BASE}/api/cart/${customerId}/items/${cartItemId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ quantity })
            });

            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            setCartItems(payload?.cart?.items || []);
        } catch {
        } finally {
            setUpdatingItemId(null);
        }
    };

    const activeCartItem = useMemo(() => {
        if (!itemOptionsState?.cartItemId) {
            return null;
        }

        return cartItems.find((cartItem) => cartItem.id === itemOptionsState.cartItemId) || null;
    }, [cartItems, itemOptionsState]);

    const filteredSubstitutionItems = useMemo(() => {
        const term = substitutionSearch.trim().toLowerCase();
        if (!term) {
            return substitutionItems;
        }

        return substitutionItems.filter((item) => {
            const name = item?.name?.toLowerCase() || '';
            const category = item?.category?.toLowerCase() || '';
            return name.includes(term) || category.includes(term);
        });
    }, [substitutionItems, substitutionSearch]);

    const openItemOptions = (cartItem) => {
        setItemOptionsError('');
        setSubstitutionSearch('');
        setSpecialInstructionsDraft(cartItem?.notes || '');
        setItemOptionsState({
            cartItemId: cartItem.id,
            mode: 'menu'
        });
    };

    const closeItemOptions = () => {
        setItemOptionsState(null);
        setItemOptionsError('');
        setSubstitutionSearch('');
    };

    const loadSubstitutionItems = async () => {
        if (!cartStoreId) {
            setItemOptionsError('Store information is unavailable for this cart.');
            return;
        }

        setIsLoadingSubstitutions(true);
        setItemOptionsError('');

        try {
            const response = await fetch(`${API_BASE}/api/items?storeId=${cartStoreId}`);
            if (!response.ok) {
                setItemOptionsError('Unable to load substitution items.');
                return;
            }

            const payload = await response.json();
            if (!payload?.success) {
                setItemOptionsError('Unable to load substitution items.');
                return;
            }

            const items = payload.items || [];
            setSubstitutionItems(items);
            setSubstitutionQuantities((currentQuantities) => {
                const next = { ...currentQuantities };
                items.forEach((item) => {
                    if (!next[item.id]) {
                        next[item.id] = 1;
                    }
                });
                return next;
            });
        } catch {
            setItemOptionsError('Unable to load substitution items.');
        } finally {
            setIsLoadingSubstitutions(false);
        }
    };

    const setCartItemOptions = async (cartItemId, body) => {
        const token = localStorage.getItem('authToken');
        if (!token || !customerId || !cartItemId) {
            return false;
        }

        setUpdatingItemId(cartItemId);
        setItemOptionsError('');

        try {
            const response = await fetch(`${API_BASE}/api/cart/${customerId}/items/${cartItemId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                setItemOptionsError('Unable to save item options.');
                return false;
            }

            const payload = await response.json();
            setCartItems(payload?.cart?.items || []);
            setCartStoreId(payload?.cart?.storeId || cartStoreId || null);
            return true;
        } catch {
            setItemOptionsError('Unable to save item options.');
            return false;
        } finally {
            setUpdatingItemId(null);
        }
    };

    const removeCartItemCompletely = async (cartItemId) => {
        const token = localStorage.getItem('authToken');
        if (!token || !customerId || !cartItemId) {
            return;
        }

        setUpdatingItemId(cartItemId);
        setItemOptionsError('');

        try {
            const response = await fetch(`${API_BASE}/api/cart/${customerId}/items/${cartItemId}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                setItemOptionsError('Unable to remove this item from cart.');
                return;
            }

            const payload = await response.json();
            setCartItems(payload?.cart?.items || []);
            setCartStoreId(payload?.cart?.storeId || cartStoreId || null);
            closeItemOptions();
        } catch {
            setItemOptionsError('Unable to remove this item from cart.');
        } finally {
            setUpdatingItemId(null);
        }
    };

    const handleEmptyCart = () => {
        if (!customerId || isClearingCart) {
            return;
        }
        setIsEmptyCartConfirmOpen(true);
    };

    const handleConfirmEmptyCart = async () => {
        setIsEmptyCartConfirmOpen(false);

        const token = localStorage.getItem('authToken');
        if (!token || !customerId) {
            return;
        }

        setIsClearingCart(true);

        try {
            const response = await fetch(`${API_BASE}/api/cart/${customerId}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                return;
            }

            setCartItems([]);
        } catch {
        } finally {
            setIsClearingCart(false);
        }
    };

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

    const hasItems = cartItems.length > 0;

    return (
        <div className="cart-screen">
            <header className="cart-screen__topbar">
                <span className="cart-screen__welcome">Hello, {firstName}!</span>
                <button
                    type="button"
                    className="cart-screen__menu-button"
                    aria-label="Open menu"
                    onClick={openMenu}
                >
                    ☰
                </button>
            </header>

            <main className="cart-screen__content">
                <section className="cart-screen__header-row">
                    <h1 className="cart-screen__title">Your Cart</h1>
                    <div className="cart-screen__header-actions">
                        <button
                            type="button"
                            className="cart-screen__button cart-screen__button--back"
                            onClick={() => navigate('/storefront')}
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            className="cart-screen__button cart-screen__button--empty"
                            onClick={handleEmptyCart}
                            disabled={!hasItems || isClearingCart}
                        >
                            {isClearingCart ? 'Emptying...' : 'Empty Cart'}
                        </button>
                    </div>
                </section>

                <section className="cart-screen__items" aria-live="polite">
                    {isLoading && <p className="cart-screen__empty">Loading cart...</p>}

                    {!isLoading && !hasItems && (
                        <p className="cart-screen__empty">Your cart is empty!</p>
                    )}

                    {!isLoading && hasItems && cartItems.map((cartItem) => {
                        const item = cartItem?.item || {};
                        const quantity = Number(cartItem?.quantity || 1);
                        const unitPrice = Number(item?.price || 0);
                        const isUpdating = updatingItemId === cartItem.id;

                        return (
                            <article key={cartItem.id} className="cart-item-card">
                                {item?.imageUrl ? (
                                    <img
                                        src={item.imageUrl}
                                        alt={item?.name || 'Cart item'}
                                        className="cart-item-card__image"
                                    />
                                ) : (
                                    <div className="cart-item-card__image cart-item-card__image--placeholder">
                                        ITEM IMAGE HERE
                                    </div>
                                )}

                                <div className="cart-item-card__details">
                                    <h2 className="cart-item-card__name">{item?.name || 'Item'}</h2>
                                    <p className="cart-item-card__price">{formatCurrency(unitPrice)} each</p>
                                    <p className="cart-item-card__substitution">
                                        {cartItem?.substitutionItem
                                            ? `Substitute: ${Number(cartItem?.substitutionQuantity || 1)} x ${cartItem.substitutionItem.name}`
                                            : 'No substitute selected'}
                                    </p>
                                </div>

                                <div className="cart-item-card__actions">
                                    <div className="cart-item-card__quantity" aria-label={`${item?.name || 'Item'} quantity`}>
                                        <button
                                            type="button"
                                            className="cart-item-card__quantity-button"
                                            onClick={() => updateItemQuantity(cartItem.id, quantity - 1)}
                                            disabled={isUpdating || quantity <= 1}
                                            aria-label={`Decrease ${item?.name || 'item'} quantity`}
                                        >
                                            -
                                        </button>
                                        <span className="cart-item-card__quantity-value">{quantity}</span>
                                        <button
                                            type="button"
                                            className="cart-item-card__quantity-button"
                                            onClick={() => updateItemQuantity(cartItem.id, quantity + 1)}
                                            disabled={isUpdating}
                                            aria-label={`Increase ${item?.name || 'item'} quantity`}
                                        >
                                            +
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="cart-item-card__options-button"
                                        onClick={() => openItemOptions(cartItem)}
                                    >
                                        Item Options
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </section>

                <footer className="cart-screen__footer">
                    <div>
                        <p className="cart-screen__total-label">
                            ESTIMATED TOTAL
                            <button
                                type="button"
                                className="cart-screen__info-button"
                                aria-label="Estimated total information"
                                onClick={() => setIsEstimatedTotalInfoOpen(true)}
                            >
                                i
                            </button>
                        </p>
                        <p className="cart-screen__total-value">{formatCurrency(estimatedTotal)}</p>
                    </div>
                    <button
                        type="button"
                        className="cart-screen__checkout-button"
                        disabled={!hasItems}
                        onClick={() => navigate('/schedule', { state: { fromCheckout: true } })}
                    >
                        Check Out
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

            {itemOptionsState && activeCartItem && (
                <div className="cart-item-options-overlay" onClick={closeItemOptions}>
                    <section className="cart-item-options-card" onClick={(event) => event.stopPropagation()}>
                        <h2 className="cart-item-options-card__title">Item Options</h2>
                        <p className="cart-item-options-card__subtitle">{activeCartItem?.item?.name || 'Item'}</p>

                        {itemOptionsError && <p className="cart-item-options-card__error">{itemOptionsError}</p>}

                        {itemOptionsState.mode === 'menu' && (
                            <div className="cart-item-options-card__menu">
                                <button
                                    type="button"
                                    className="cart-item-options-card__action"
                                    onClick={async () => {
                                        setItemOptionsState({ cartItemId: activeCartItem.id, mode: 'substitution' });
                                        await loadSubstitutionItems();
                                    }}
                                >
                                    Set Substitution
                                </button>
                                <button
                                    type="button"
                                    className="cart-item-options-card__action"
                                    onClick={() => {
                                        setSpecialInstructionsDraft(activeCartItem?.notes || '');
                                        setItemOptionsState({ cartItemId: activeCartItem.id, mode: 'instructions' });
                                    }}
                                >
                                    Set Special Instructions
                                </button>
                                <button
                                    type="button"
                                    className="cart-item-options-card__action cart-item-options-card__action--danger"
                                    disabled={updatingItemId === activeCartItem.id}
                                    onClick={() => removeCartItemCompletely(activeCartItem.id)}
                                >
                                    Remove All From Cart
                                </button>
                                <button
                                    type="button"
                                    className="cart-item-options-card__action cart-item-options-card__action--secondary"
                                    onClick={closeItemOptions}
                                >
                                    Back
                                </button>
                            </div>
                        )}

                        {itemOptionsState.mode === 'instructions' && (
                            <div className="cart-item-options-card__instructions">
                                <textarea
                                    className="cart-item-options-card__textarea"
                                    value={specialInstructionsDraft}
                                    onChange={(event) => setSpecialInstructionsDraft(event.target.value)}
                                    placeholder="Enter special instructions for employees"
                                    rows={5}
                                />
                                <div className="cart-item-options-card__footer-actions">
                                    <button
                                        type="button"
                                        className="cart-item-options-card__action cart-item-options-card__action--danger"
                                        disabled={!activeCartItem?.substitutionItem || updatingItemId === activeCartItem.id}
                                        onClick={async () => {
                                            const saved = await setCartItemOptions(activeCartItem.id, {
                                                clearSubstitution: true
                                            });

                                            if (saved) {
                                                setItemOptionsState({ cartItemId: activeCartItem.id, mode: 'menu' });
                                            }
                                        }}
                                    >
                                        Clear Substitution
                                    </button>
                                    <button
                                        type="button"
                                        className="cart-item-options-card__action cart-item-options-card__action--secondary"
                                        onClick={() => setItemOptionsState({ cartItemId: activeCartItem.id, mode: 'menu' })}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="cart-item-options-card__action"
                                        disabled={updatingItemId === activeCartItem.id}
                                        onClick={async () => {
                                            const saved = await setCartItemOptions(activeCartItem.id, {
                                                notes: specialInstructionsDraft
                                            });

                                            if (saved) {
                                                setItemOptionsState({ cartItemId: activeCartItem.id, mode: 'menu' });
                                            }
                                        }}
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        )}

                        {itemOptionsState.mode === 'substitution' && (
                            <div className="cart-item-options-card__substitutions">
                                <div className="cart-item-options-card__search-row">
                                    <input
                                        type="text"
                                        className="cart-item-options-card__search"
                                        placeholder="Search items"
                                        value={substitutionSearch}
                                        onChange={(event) => setSubstitutionSearch(event.target.value)}
                                    />
                                </div>

                                {isLoadingSubstitutions && <p className="cart-item-options-card__loading">Loading items...</p>}

                                {!isLoadingSubstitutions && (
                                    <div className="cart-item-options-card__substitution-list">
                                        {filteredSubstitutionItems.map((item) => {
                                            const substitutionQuantity = Number(substitutionQuantities[item.id] || 1);
                                            const isUpdatingCurrent = updatingItemId === activeCartItem.id;

                                            return (
                                                <article key={item.id} className="cart-substitution-item-card">
                                                    <div className="cart-substitution-item-card__content">
                                                        <p className="cart-substitution-item-card__name">{item.name}</p>
                                                        <p className="cart-substitution-item-card__price">{formatCurrency(item.price)}</p>
                                                    </div>
                                                    <div className="cart-substitution-item-card__controls">
                                                        <div className="cart-substitution-item-card__quantity">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSubstitutionQuantities((currentQuantities) => ({
                                                                    ...currentQuantities,
                                                                    [item.id]: Math.max(1, substitutionQuantity - 1)
                                                                }))}
                                                            >
                                                                -
                                                            </button>
                                                            <span>{substitutionQuantity}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setSubstitutionQuantities((currentQuantities) => ({
                                                                    ...currentQuantities,
                                                                    [item.id]: substitutionQuantity + 1
                                                                }))}
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="cart-substitution-item-card__set"
                                                            disabled={isUpdatingCurrent}
                                                            onClick={async () => {
                                                                const saved = await setCartItemOptions(activeCartItem.id, {
                                                                    substitutionItemId: item.id,
                                                                    substitutionQuantity
                                                                });

                                                                if (saved) {
                                                                    setItemOptionsState({ cartItemId: activeCartItem.id, mode: 'menu' });
                                                                }
                                                            }}
                                                        >
                                                            Set Substitution
                                                        </button>
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="cart-item-options-card__footer-actions">
                                    <button
                                        type="button"
                                        className="cart-item-options-card__action cart-item-options-card__action--secondary"
                                        onClick={() => setItemOptionsState({ cartItemId: activeCartItem.id, mode: 'menu' })}
                                    >
                                        Back
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            )}
        {isEmptyCartConfirmOpen && (
            <div className="cart-confirm-overlay" onClick={() => setIsEmptyCartConfirmOpen(false)}>
                <section className="cart-confirm-card" onClick={(event) => event.stopPropagation()}>
                    <h2 className="cart-confirm-card__title">Empty Cart</h2>
                    <p className="cart-confirm-card__message">Are you sure you want to remove all items from your cart?</p>
                    <div className="cart-confirm-card__actions">
                        <button
                            type="button"
                            className="cart-confirm-card__button cart-confirm-card__button--cancel"
                            onClick={() => setIsEmptyCartConfirmOpen(false)}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="cart-confirm-card__button cart-confirm-card__button--confirm"
                            onClick={handleConfirmEmptyCart}
                        >
                            Empty Cart
                        </button>
                    </div>
                </section>
            </div>
        )}
        </div>
    );
};

export default CartScreen;