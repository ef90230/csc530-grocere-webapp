import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerPopupMenu from '../components/customer/CustomerPopupMenu';
import OrderDetailModal from '../components/customer/OrderDetailModal';
import {
  deriveCustomerOrderStatus,
  CUSTOMER_ORDER_STATUS_LABELS,
  CUSTOMER_ORDER_STATUS_TO_PILL_VARIANT
} from '../utils/customerOrderStatus';
import './OrderSummary.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const CLOSE_ANIMATION_MS = 280;

const formatOrderDate = (dateString) => {
  if (!dateString) return 'Date unavailable';
  
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    
    return date.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return 'Date unavailable';
  }
};

const resolveStorePhone = (order) => {
  const configuredPhone = order?.store?.storePhone;
  const fallbackPhone = order?.store?.phone;
  const source = configuredPhone || fallbackPhone;

  if (!source) {
    return '';
  }

  return String(source).trim();
};

const toDialablePhone = (phone) => {
  if (!phone) {
    return '';
  }

  return String(phone).replace(/[^0-9+*#,.;]/g, '');
};

const OrderSummary = () => {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState(null);
  const [isProfileResolved, setIsProfileResolved] = useState(false);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
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
        setCustomerId(payload?.user?.id || null);
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

    if (!customerId) {
      setIsLoading(false);
      return;
    }

    const token = localStorage.getItem('authToken');
    if (!token) {
      setIsLoading(false);
      return;
    }

    const loadOrders = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/orders?customerId=${customerId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          setOrders([]);
          return;
        }

        const payload = await response.json();
        const allOrders = payload?.orders || [];
        const ordersWithPhase = allOrders.map((order) => ({
          ...order,
          customerPhase: deriveCustomerOrderStatus(order)
        }));
        
        // Sort by createdAt in descending order (newest first)
        const sortedOrders = ordersWithPhase.sort(
          (a, b) => new Date(b?.createdAt) - new Date(a?.createdAt)
        );
        
        setOrders(sortedOrders);
      } catch {
        setOrders([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadOrders();
  }, [isProfileResolved, customerId]);

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

  const handleOrderUpdated = (updatedOrder) => {
    if (!updatedOrder?.id) {
      return;
    }

    const resolvedPhase = deriveCustomerOrderStatus(updatedOrder);
    const normalizedOrder = {
      ...updatedOrder,
      customerPhase: resolvedPhase
    };

    setOrders((currentOrders) => currentOrders.map((order) => {
      if (order.id !== updatedOrder.id) {
        return order;
      }

      return normalizedOrder;
    }));

    setSelectedOrder((currentOrder) => {
      if (!currentOrder || currentOrder.id !== updatedOrder.id) {
        return currentOrder;
      }

      return normalizedOrder;
    });
  };

  const handleOpenOrder = (order) => {
    setSelectedOrder(order);
  };

  const handleCallStore = (event, order) => {
    if (event) {
      event.stopPropagation();
    }

    const storePhone = resolveStorePhone(order);
    const dialablePhone = toDialablePhone(storePhone);
    if (!dialablePhone) {
      window.alert('Store phone number is not available right now.');
      return;
    }

    try {
      window.location.href = `tel:${dialablePhone}`;
    } catch {
      window.alert(`Unable to open your phone app. Call ${storePhone} manually.`);
    }
  };

  const pageStorePhoneOrder = orders.find((order) => resolveStorePhone(order));

  return (
    <div className="order-summary-page">
      <header className="order-summary-topbar">
        <button
          type="button"
          className="order-summary-back-button"
          aria-label="Go back"
          onClick={() => navigate('/storefront')}
        >
          ←
        </button>
        <h1 className="order-summary-title">My Orders</h1>
        <button
          type="button"
          className="order-summary-menu-button"
          aria-label="Open menu"
          onClick={openMenu}
        >
          ☰
        </button>
      </header>
      <div className="order-summary-topbar-spacer" />

      <main className="order-summary-content">
        <section className="order-summary-call-store-row" aria-label="Store contact action">
          <button
            type="button"
            className="order-summary-call-store-btn"
            onClick={(event) => {
              if (!pageStorePhoneOrder) {
                window.alert('Store phone number is not available right now.');
                return;
              }
              handleCallStore(event, pageStorePhoneOrder);
            }}
          >
            Call Store
          </button>
        </section>

        <section className="order-summary-hero">
          <p className="order-summary-hero__eyebrow">Order history</p>
          <h2 className="order-summary-hero__title">Review every scheduled order in one place.</h2>
          <p className="order-summary-hero__copy">
            Select an order to see line items, substitutions, totals, and its current fulfillment status.
          </p>
        </section>

        {isLoading && (
          <div className="order-summary-loading">
            <p>Loading orders...</p>
          </div>
        )}

        {!isLoading && orders.length === 0 && (
          <div className="order-summary-empty-state">
            <p>No orders found. Schedule orders to make them appear here.</p>
          </div>
        )}

        {!isLoading && orders.length > 0 && (
          <section className="order-summary-list" aria-label="Order history">
            {orders.map((order) => (
              <div
                key={order.id}
                className="order-summary-item"
                role="button"
                tabIndex={0}
                onClick={() => handleOpenOrder(order)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleOpenOrder(order);
                  }
                }}
                aria-label={`View order ${order.id} from ${formatOrderDate(order.createdAt)}`}
              >
                <div className="order-summary-item__header">
                  <span className="order-summary-item__id">Order #{order.id}</span>
                  <span className="order-summary-item__date">
                    {formatOrderDate(order.createdAt)}
                  </span>
                </div>
                <div className="order-summary-item__status-row">
                  <span
                    className={`order-summary-status-pill order-summary-status-pill--${CUSTOMER_ORDER_STATUS_TO_PILL_VARIANT[order.customerPhase]}`}
                  >
                    {CUSTOMER_ORDER_STATUS_LABELS[order.customerPhase] || 'ORDER PLACED'}
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}
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

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onOrderUpdated={handleOrderUpdated}
        />
      )}
    </div>
  );
};

export default OrderSummary;
