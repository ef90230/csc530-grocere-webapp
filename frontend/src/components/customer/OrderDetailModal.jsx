import React, { useMemo } from 'react';
import './OrderDetailModal.css';

const ORDER_STATUS_LABELS = {
  assigned: 'Picker Assigned',
  picking: 'Picking In Progress',
  picked: 'Picking Complete',
  staging: 'Partially Staged',
  staged: 'Staging Complete',
  ready: 'Ready for Pickup',
  dispensing: 'Dispensing In Progress',
  complete: 'Complete'
};

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const getItemStatus = (orderItem) => {
  const orderedQuantity = Number(orderItem?.quantity || 0);
  const pickedQuantity = Math.max(0, Number(orderItem?.pickedQuantity || 0));
  const normalizedStatus = String(orderItem?.status || '').toLowerCase();

  if (normalizedStatus === 'found' || pickedQuantity >= orderedQuantity) {
    return { label: 'Picked', kind: 'picked' };
  }

  if (normalizedStatus === 'substituted') {
    return { label: 'Not Found', kind: 'not-found' };
  }

  if (pickedQuantity > 0 && pickedQuantity < orderedQuantity) {
    return { label: `${pickedQuantity} of ${orderedQuantity} Picked`, kind: 'partial' };
  }

  if (normalizedStatus === 'out_of_stock' || normalizedStatus === 'skipped') {
    return { label: 'Not Found', kind: 'not-found' };
  }

  return { label: 'Not Yet Picked', kind: 'pending' };
};

const getSubstituteStatus = (orderItem) => {
  const normalizedStatus = String(orderItem?.status || '').toLowerCase();

  if (normalizedStatus === 'substituted') {
    return { label: 'Picked', kind: 'picked' };
  }

  if (normalizedStatus === 'out_of_stock' || normalizedStatus === 'skipped') {
    return { label: 'Not Found', kind: 'not-found' };
  }

  return { label: 'Not Yet Picked', kind: 'pending' };
};

const OrderDetailModal = ({ order, onClose }) => {
  const orderTotal = useMemo(() => {
    if (!Array.isArray(order?.items)) {
      return 0;
    }

    return order.items.reduce((sum, orderItem) => {
      const unitPrice = Number(orderItem?.item?.price || 0);
      const quantity = Number(orderItem?.quantity || 0);
      return sum + (unitPrice * quantity);
    }, 0);
  }, [order]);

  const statusLabel = ORDER_STATUS_LABELS[order?.status] || order?.status || 'Unknown';

  return (
    <div className="order-detail-overlay" onClick={onClose}>
      <div className="order-detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="order-detail-header">
          <h2 className="order-detail-id">Order #{order?.id}</h2>
          <div className="order-detail-header-actions">
            <span className="order-detail-status">{statusLabel}</span>
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
                const itemStatus = getItemStatus(orderItem);
                const shouldShowSubstituteStatus = Boolean(substitutedItem) && String(orderItem?.status || '').toLowerCase() !== 'found';
                const substituteStatus = shouldShowSubstituteStatus ? getSubstituteStatus(orderItem) : null;

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
            {order?.status === 'complete' ? (
              <p className="order-detail-total-label">Final Total</p>
            ) : (
              <p className="order-detail-total-label">Estimated Total</p>
            )}
            <p className="order-detail-total-value">{formatCurrency(orderTotal)}</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default OrderDetailModal;
