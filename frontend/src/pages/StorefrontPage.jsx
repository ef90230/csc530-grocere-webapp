import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerPopupMenu from '../components/customer/CustomerPopupMenu';
import './StorefrontPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const CLOSE_ANIMATION_MS = 280;
const ACTIVE_ORDER_STATUSES = ['assigned', 'picking', 'picked', 'staging', 'staged', 'ready', 'dispensing'];
const ORDER_STATUS_LABELS = {
  assigned: 'Picker Assigned',
  picking: 'Picking In Progress',
  picked: 'Picking Complete',
  staging: 'Partially Staged',
  staged: 'Staging Complete',
  ready: 'Ready for Pickup',
  dispensing: 'Dispensing In Progress'
};

const getOnHandTotal = (item) => (
  Array.isArray(item?.locations)
    ? item.locations.reduce((sum, locationRow) => sum + Number(locationRow?.quantityOnHand || 0), 0)
    : 0
);

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const formatPickupTime = (value) => {
  if (!value) {
    return 'Pickup time pending';
  }

  const pickupDate = new Date(value);
  if (Number.isNaN(pickupDate.getTime())) {
    return 'Pickup time pending';
  }

  return pickupDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
};

const StorefrontPage = () => {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('Customer');
  const [customerId, setCustomerId] = useState(null);
  const [preferredStoreId, setPreferredStoreId] = useState(null);
  const [isProfileResolved, setIsProfileResolved] = useState(false);
  const [items, setItems] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [activeOrder, setActiveOrder] = useState(null);
  const [quantityByItemId, setQuantityByItemId] = useState({});
  const [addingItemId, setAddingItemId] = useState(null);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isMenuClosing, setIsMenuClosing] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('authToken');

    const loadCurrentUser = async () => {
      if (!token) {
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const resolvedName = payload?.user?.firstName || '';

        if (resolvedName) {
          setFirstName(resolvedName);
        }

        setCustomerId(payload?.user?.id || null);
        setPreferredStoreId(payload?.user?.preferredStoreId || null);
      } catch {
      } finally {
        setIsProfileResolved(true);
      }
    };

    if (!token) {
      setIsProfileResolved(true);
      return;
    }

    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (!isProfileResolved) {
      return;
    }

    const loadItems = async () => {
      try {
        const query = preferredStoreId ? `?storeId=${preferredStoreId}` : '';
        const response = await fetch(`${API_BASE}/api/items${query}`);
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (!payload.success) {
          return;
        }
        setItems(payload.items || []);
      } catch {
      }
    };

    loadItems();
  }, [isProfileResolved, preferredStoreId]);

  useEffect(() => {
    const token = localStorage.getItem('authToken');

    if (!token || !customerId) {
      return;
    }

    const headers = {
      Authorization: `Bearer ${token}`
    };

    const loadCustomerState = async () => {
      try {
        const [cartResponse, ordersResponse] = await Promise.all([
          fetch(`${API_BASE}/api/cart/${customerId}`, { headers }),
          fetch(`${API_BASE}/api/orders?customerId=${customerId}`, { headers })
        ]);

        if (cartResponse.ok) {
          const cartPayload = await cartResponse.json();
          setCartItemCount(cartPayload?.cart?.totalQuantity || 0);
        }

        if (ordersResponse.ok) {
          const ordersPayload = await ordersResponse.json();
          const matchingOrder = (ordersPayload?.orders || [])
            .filter((order) => ACTIVE_ORDER_STATUSES.includes(order?.status))
            .sort((left, right) => new Date(left?.scheduledPickupTime) - new Date(right?.scheduledPickupTime))[0] || null;

          setActiveOrder(matchingOrder);
        }
      } catch {
      }
    };

    loadCustomerState();
  }, [customerId]);

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

  const visibleItems = useMemo(() => (
    items.filter((item) => item?.isActive !== false)
  ), [items]);

  const suggestions = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    if (!term) {
      return [];
    }

    const names = visibleItems
      .map((item) => item?.name)
      .filter(Boolean)
      .filter((name) => name.toLowerCase().includes(term));

    const categories = visibleItems
      .map((item) => item?.category)
      .filter(Boolean)
      .filter((category) => category.toLowerCase().includes(term));

    const deduped = [...new Set([...names, ...categories])];
    return deduped.slice(0, 8);
  }, [searchInput, visibleItems]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = appliedSearchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return visibleItems;
    }

    return visibleItems.filter((item) => {
      const name = item?.name?.toLowerCase() || '';
      const category = item?.category?.toLowerCase() || '';
      return name.includes(normalizedSearch) || category.includes(normalizedSearch);
    });
  }, [appliedSearchTerm, visibleItems]);

  const submitSearch = (event) => {
    event.preventDefault();
    setShowSuggestions(false);
    setAppliedSearchTerm(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setAppliedSearchTerm('');
    setShowSuggestions(false);
  };

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

  const updateQuantity = (itemId, nextQuantity) => {
    setQuantityByItemId((currentQuantities) => ({
      ...currentQuantities,
      [itemId]: nextQuantity
    }));
  };

  const decrementQuantity = (itemId, currentQuantity) => {
    updateQuantity(itemId, Math.max(1, currentQuantity - 1));
  };

  const incrementQuantity = (itemId, currentQuantity, onHandTotal) => {
    updateQuantity(itemId, Math.min(onHandTotal, currentQuantity + 1));
  };

  const addItemToCart = async (item) => {
    const token = localStorage.getItem('authToken');
    const quantity = quantityByItemId[item.id] || 1;
    const onHandTotal = getOnHandTotal(item);
    const resolvedStoreId = preferredStoreId || item?.locations?.[0]?.storeId;

    if (!token || !customerId || onHandTotal <= 0) {
      return;
    }

    setAddingItemId(item.id);

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      if (resolvedStoreId) {
        await fetch(`${API_BASE}/api/cart/${customerId}/store`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ storeId: resolvedStoreId })
        });
      }

      const response = await fetch(`${API_BASE}/api/cart/${customerId}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          itemId: item.id,
          quantity
        })
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      setCartItemCount(payload?.cart?.totalQuantity || 0);
      updateQuantity(item.id, 1);
    } catch {
    } finally {
      setAddingItemId(null);
    }
  };

  const activeOrderItemCount = activeOrder?.items?.reduce(
    (sum, orderItem) => sum + Number(orderItem?.quantity || 0),
    0
  ) || 0;

  const activeOrderStoreLabel = activeOrder?.store?.storeNumber
    ? `Store ${activeOrder.store.storeNumber}`
    : activeOrder?.store?.name || 'your store';

  const hasAppliedSearch = appliedSearchTerm.trim().length > 0;

  return (
    <div className="storefront-page">
      <header className="storefront-topbar">
        <span className="storefront-greeting">Hello, {firstName}!</span>
        <form className="storefront-search-wrap" onSubmit={submitSearch}>
          <div className="storefront-search-input-wrap">
            <input
              type="text"
              className="storefront-search-input"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search items or categories"
              aria-label="Search storefront"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="storefront-suggestions">
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput(suggestion);
                        setShowSuggestions(false);
                      }}
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="submit" className="storefront-search-button">Search</button>
        </form>
        <button
          type="button"
          className="storefront-cart-button"
          aria-label="Go to cart"
          onClick={() => navigate('/cart')}
        >
          <span aria-hidden="true">🛒</span>
          {cartItemCount > 0 && <span className="storefront-cart-badge">{cartItemCount}</span>}
        </button>
        <button
          type="button"
          className="storefront-menu-button"
          aria-label="Open menu"
          onClick={openMenu}
        >
          ☰
        </button>
      </header>
      <div className="storefront-topbar-spacer" />
      <main className="storefront-content">
        {activeOrder && (
          <section className="storefront-order-card">
            <div className="storefront-order-card__header">
              <p className="storefront-order-card__eyebrow">
                You have one order at {activeOrderStoreLabel}.
              </p>
              <span className="storefront-order-status-pill">
                {ORDER_STATUS_LABELS[activeOrder.status] || activeOrder.status}
              </span>
            </div>
            <div className="storefront-order-card__body">
              <div>
                <p className="storefront-order-card__time">{formatPickupTime(activeOrder.scheduledPickupTime)}</p>
                <p className="storefront-order-card__items">{activeOrderItemCount} items</p>
              </div>
              <button
                type="button"
                className="storefront-order-card__cta"
                onClick={() => navigate('/cart')}
              >
                Track order
              </button>
            </div>
          </section>
        )}

        {hasAppliedSearch && (
          <section className="storefront-search-results-banner" aria-live="polite">
            <p className="storefront-search-results-banner__text">
              Search results for: <strong>{appliedSearchTerm}</strong>
            </p>
            <button
              type="button"
              className="storefront-search-results-banner__clear"
              onClick={clearSearch}
            >
              Clear
            </button>
          </section>
        )}

        <section className="storefront-item-grid" aria-label="Store items">
          {filteredItems.map((item) => {
            const onHandTotal = getOnHandTotal(item);
            const quantity = quantityByItemId[item.id] || 1;
            const canDecrease = onHandTotal > 0 && quantity > 1;
            const canIncrease = onHandTotal > 0 && quantity < onHandTotal;
            const isOutOfStock = onHandTotal <= 0;

            return (
              <article key={item.id} className="storefront-item-card">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="storefront-item-card__image"
                  />
                ) : (
                  <div className="storefront-item-card__image storefront-item-card__image--placeholder">
                    <span>ITEM IMAGE HERE</span>
                  </div>
                )}
                <div className="storefront-item-card__body">
                  <h2 className="storefront-item-card__name">{item.name}</h2>
                  <p className="storefront-item-card__price">{formatCurrency(item.price)}</p>
                  <div className="storefront-quantity-picker" aria-label={`${item.name} quantity`}>
                    <button
                      type="button"
                      className="storefront-quantity-picker__button storefront-quantity-picker__button--minus"
                      onClick={() => decrementQuantity(item.id, quantity)}
                      disabled={!canDecrease}
                      aria-label={`Decrease ${item.name} quantity`}
                    >
                      -
                    </button>
                    <span className="storefront-quantity-picker__value">{quantity}</span>
                    <button
                      type="button"
                      className="storefront-quantity-picker__button storefront-quantity-picker__button--plus"
                      onClick={() => incrementQuantity(item.id, quantity, onHandTotal)}
                      disabled={!canIncrease}
                      aria-label={`Increase ${item.name} quantity`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="storefront-add-cart-button"
                    disabled={isOutOfStock || addingItemId === item.id}
                    onClick={() => addItemToCart(item)}
                  >
                    {isOutOfStock ? 'Out of stock' : addingItemId === item.id ? 'Adding...' : 'Add to Cart'}
                  </button>
                </div>
              </article>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="storefront-empty-state">
              <h2>No items match that search.</h2>
              <p>Try a different item name or category.</p>
            </div>
          )}
        </section>
      </main>
      {(isMenuVisible || isMenuClosing) && (
        <CustomerPopupMenu
          isClosing={isMenuClosing}
          onClose={closeMenu}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
};

export default StorefrontPage;