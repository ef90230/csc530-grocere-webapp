import React, { useMemo, useState } from 'react';
import ParkingSpaceDialog from '../common/ParkingSpaceDialog';
import {
  calculateCurrentEstimatedOrderTotal,
  calculateOrderTotalAtTimeOfOrdering,
  deriveCustomerOrderStatus,
  CUSTOMER_ORDER_PHASE,
  CUSTOMER_ORDER_STATUS_LABELS,
  CUSTOMER_ORDER_STATUS_TO_PILL_VARIANT
} from '../../utils/customerOrderStatus';
import {
  collectOccupiedParkingSpaces,
  getParkingSpaceOptions,
  toParkingSpaceNumber
} from '../../utils/parkingSpaces';
import { getOrderItemStatus } from '../../utils/orderItemStatus';
import './OrderDetailModal.css';

const API_BASE = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const getCanceledLabel = (canceledQuantity, orderedQuantity) => {
  const canceled = Math.max(0, Number(canceledQuantity || 0));
  const ordered = Math.max(0, Number(orderedQuantity || 0));

  if (canceled <= 0) {
    return '';
  }

  if (ordered > 0 && canceled >= ordered) {
    return 'Canceled';
  }

  return `${canceled} of ${ordered} Canceled`;
};

const getSubstituteStatus = (orderItem, options = {}) => {
  const orderedQuantity = Number(orderItem?.quantity || 0);
  const pickedQuantity = Math.max(0, Number(orderItem?.pickedQuantity || 0));
  const normalizedStatus = String(orderItem?.status || '').toLowerCase();
  const isOrderComplete = Boolean(options?.isOrderComplete);
  const canceledQuantity = Math.max(0, orderedQuantity - pickedQuantity);

  if (isOrderComplete && canceledQuantity > 0) {
    return { label: getCanceledLabel(canceledQuantity, orderedQuantity), kind: 'canceled' };
  }

  if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') {
    return { label: 'Canceled', kind: 'canceled' };
  }

  if (normalizedStatus === 'substituted') {
    return { label: 'Picked', kind: 'picked' };
  }

  if (normalizedStatus === 'out_of_stock' || normalizedStatus === 'skipped') {
    return { label: 'Not Found', kind: 'not-found' };
  }

  return { label: 'Not Yet Picked', kind: 'pending' };
};

const OrderDetailModal = ({ order, onClose, onOrderUpdated }) => {
  const [isCheckInDialogOpen, setIsCheckInDialogOpen] = useState(false);
  const [selectedParkingSpace, setSelectedParkingSpace] = useState(null);
  const [occupiedParkingSpaceSet, setOccupiedParkingSpaceSet] = useState(new Set());
  const [isCheckInSubmitting, setIsCheckInSubmitting] = useState(false);
  const [checkInError, setCheckInError] = useState('');

  const orderTotalAtTimeOfOrdering = useMemo(() => {
    return calculateOrderTotalAtTimeOfOrdering(order);
  }, [order]);

  const currentEstimatedTotal = useMemo(() => {
    return calculateCurrentEstimatedOrderTotal(order);
  }, [order]);

  const customerOrderPhase = deriveCustomerOrderStatus(order);
  const isOrderComplete = customerOrderPhase === CUSTOMER_ORDER_PHASE.ORDER_COMPLETE;
  const statusLabel = CUSTOMER_ORDER_STATUS_LABELS[customerOrderPhase] || 'ORDER PLACED';
  const statusVariant = CUSTOMER_ORDER_STATUS_TO_PILL_VARIANT[customerOrderPhase] || 'picking_not_started';
  const canCheckIn = customerOrderPhase === CUSTOMER_ORDER_PHASE.READY_FOR_PICKUP;
  const shouldShowCurrentEstimatedTotal = ![
    CUSTOMER_ORDER_PHASE.ORDER_CANCELED,
    CUSTOMER_ORDER_PHASE.ORDER_PLACED
  ].includes(customerOrderPhase);
  const adjustedTotalLabel = isOrderComplete ? 'Final Total' : 'Current Estimated Total';

  const availableParkingSpaces = useMemo(() => {
    const currentParkingSpace = toParkingSpaceNumber(selectedParkingSpace);

    return getParkingSpaceOptions({
      occupiedSpaces: Array.from(occupiedParkingSpaceSet),
      includeSpaces: currentParkingSpace ? [currentParkingSpace] : []
    });
  }, [occupiedParkingSpaceSet, selectedParkingSpace]);

  const openCheckInDialog = async () => {
    const token = window.localStorage.getItem('authToken');
    setCheckInError('');
    setSelectedParkingSpace(toParkingSpaceNumber(order?.parkingSpot));
    setIsCheckInDialogOpen(true);

    if (!token) {
      setOccupiedParkingSpaceSet(new Set());
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/orders`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        setOccupiedParkingSpaceSet(new Set());
        return;
      }

      const payload = await response.json();
      setOccupiedParkingSpaceSet(collectOccupiedParkingSpaces(payload?.orders || [], order?.id));
    } catch {
      setOccupiedParkingSpaceSet(new Set());
    }
  };

  const closeCheckInDialog = () => {
    if (isCheckInSubmitting) {
      return;
    }

    setIsCheckInDialogOpen(false);
    setSelectedParkingSpace(null);
  };

  const handleCheckIn = async () => {
    const token = window.localStorage.getItem('authToken');
    if (!token || !order?.customer?.id || !order?.id) {
      setCheckInError('Unable to complete check in right now.');
      return;
    }

    if (!selectedParkingSpace) {
      setCheckInError('Please select a parking space.');
      return;
    }

    setIsCheckInSubmitting(true);
    setCheckInError('');

    try {
      const checkInResponse = await fetch(`${API_BASE}/api/customers/${order.customer.id}/checkin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: order.id,
          parkingSpot: String(selectedParkingSpace)
        })
      });

      if (!checkInResponse.ok) {
        const payload = await checkInResponse.json().catch(() => ({}));
        throw new Error(payload.message || 'Unable to check in.');
      }

      const statusResponse = await fetch(`${API_BASE}/api/orders/${order.id}/status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'dispensing' })
      });

      if (!statusResponse.ok) {
        const payload = await statusResponse.json().catch(() => ({}));
        throw new Error(payload.message || 'Unable to update order status.');
      }

      const updatedOrder = {
        ...order,
        status: 'dispensing',
        isCheckedIn: true,
        checkInTime: new Date().toISOString(),
        parkingSpot: String(selectedParkingSpace),
        customer: {
          ...(order?.customer || {}),
          vehicleInfo: order?.customer?.vehicleInfo
        }
      };

      onOrderUpdated?.(updatedOrder);
      closeCheckInDialog();
    } catch (error) {
      setCheckInError(error.message || 'Unable to check in.');
    } finally {
      setIsCheckInSubmitting(false);
    }
  };

  return (
    <div className="order-detail-overlay" onClick={onClose}>
      <div className="order-detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="order-detail-header">
          <h2 className="order-detail-id">Order #{order?.id}</h2>
          <div className="order-detail-header-actions">
            <span className={`order-detail-status order-detail-status--${statusVariant}`}>{statusLabel}</span>
            {canCheckIn ? (
              <button
                type="button"
                className="order-detail-checkin-btn"
                onClick={openCheckInDialog}
              >
                Check In
              </button>
            ) : null}
            <button
              type="button"
              className="order-detail-close"
              aria-label="Close order details"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        {checkInError ? <p className="order-detail-checkin-error">{checkInError}</p> : null}

        <section className="order-detail-section">
          <h3 className="order-detail-section-title">Items</h3>
          <div className="order-detail-items">
            {!Array.isArray(order?.items) || order.items.length === 0 ? (
              <p className="order-detail-no-items">No items in this order</p>
            ) : (
              order.items.map((orderItem, index) => {
                const item = orderItem?.item || {};
                const substitutedItem = orderItem?.substitutedItem || orderItem?.substitutionItem || null;
                const quantity = Number(orderItem?.quantity || 0);
                const unitPrice = Number(item?.price || 0);
                const subtotal = quantity * unitPrice;
                const itemStatus = getOrderItemStatus(orderItem, { isOrderComplete });
                const shouldShowSubstituteStatus = Boolean(substitutedItem) && String(orderItem?.status || '').toLowerCase() !== 'found';
                const substituteStatus = shouldShowSubstituteStatus ? getSubstituteStatus(orderItem, { isOrderComplete }) : null;

                return (
                  <article key={index} className="order-detail-item">
                    <div className="order-detail-item__header">
                      <div className="order-detail-item__title-wrap">
                        <h4 className="order-detail-item__name">{item?.name || 'Unknown Item'}</h4>
                        <p className="order-detail-item__quantity">Qty: {quantity}</p>
                      </div>
                      <span className={`order-detail-item__status order-detail-item__status--${itemStatus.kind}`}>
                        {itemStatus.label}
                      </span>
                    </div>

                    <div className="order-detail-item__pricing">
                      <span className="order-detail-item__unit-price">
                        {formatCurrency(unitPrice)} each
                      </span>
                      <span className="order-detail-item__subtotal">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>

                    {shouldShowSubstituteStatus && (
                      <div className="order-detail-item__substitution">
                        <p className="order-detail-item__substitution-label">Substitute Item</p>
                        <p className="order-detail-item__substitution-value">
                          {substitutedItem?.name || 'Unavailable substitute'}
                        </p>
                        <span className={`order-detail-item__status order-detail-item__status--${substituteStatus.kind}`}>
                          {substituteStatus.label}
                        </span>
                      </div>
                    )}

                    {orderItem?.notes && (
                      <div className="order-detail-item__notes">
                        <p className="order-detail-item__notes-label">Special Instructions:</p>
                        <p className="order-detail-item__notes-value">{orderItem.notes}</p>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="order-detail-section">
          <h3 className="order-detail-section-title">Order Total</h3>
          <div className="order-detail-total">
            <div className="order-detail-total-row">
              <p className="order-detail-total-label">Est. Total At Time of Ordering</p>
              <p className="order-detail-total-value">{formatCurrency(orderTotalAtTimeOfOrdering)}</p>
            </div>
            {shouldShowCurrentEstimatedTotal ? (
              <div className="order-detail-total-row">
                <p className="order-detail-total-label">{adjustedTotalLabel}</p>
                <p className="order-detail-total-value">{formatCurrency(currentEstimatedTotal)}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {isCheckInDialogOpen ? (
        <ParkingSpaceDialog
          title="Check In"
          subtitle={`Order #${order?.id}`}
          promptText="Select the space you are parked in."
          spaces={availableParkingSpaces}
          occupiedSpaceSet={occupiedParkingSpaceSet}
          selectedSpace={selectedParkingSpace}
          onSelectSpace={(spaceNumber) => {
            if (occupiedParkingSpaceSet.has(Number(spaceNumber)) && Number(selectedParkingSpace) !== Number(spaceNumber)) {
              return;
            }
            setSelectedParkingSpace(Number(spaceNumber));
          }}
          onClose={closeCheckInDialog}
          onConfirm={handleCheckIn}
          isSubmitting={isCheckInSubmitting}
          confirmLabel="Set"
        />
      ) : null}
    </div>
  );
};

export default OrderDetailModal;
