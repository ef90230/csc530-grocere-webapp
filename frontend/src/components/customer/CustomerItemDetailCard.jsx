import React, { useMemo, useState } from 'react';
import './CustomerItemDetailCard.css';
import StoreMapPreview from '../common/StoreMapPreview';

const toCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '$0.00';
  }
  return `$${numeric.toFixed(2)}`;
};

const getTotalOnHand = (item) => {
  const assigned = Array.isArray(item?.locations)
    ? item.locations.reduce((sum, locationRow) => sum + Number(locationRow?.quantityOnHand || 0), 0)
    : 0;

  const unassigned = Number(item?.unassignedQuantity || 0);
  return assigned + Math.max(0, unassigned);
};

const getLocationLabel = (item) => {
  if (!Array.isArray(item?.locations) || item.locations.length === 0) {
    return 'No location assigned';
  }

  const firstLocation = item.locations[0];
  const aisleNumber = firstLocation?.location?.aisle?.aisleNumber;
  const section = firstLocation?.location?.section;

  if (!aisleNumber && !section) {
    return 'Location unavailable';
  }

  if (aisleNumber && section) {
    return `Aisle ${aisleNumber} • Section ${section}`;
  }

  if (aisleNumber) {
    return `Aisle ${aisleNumber}`;
  }

  return `Section ${section}`;
};

const CustomerItemDetailCard = ({
  item,
  aisles,
  quantity,
  canDecrease,
  canIncrease,
  isOutOfStock,
  isAdding,
  onClose,
  onDecrease,
  onIncrease,
  onAddToCart
}) => {
  const [copyFeedback, setCopyFeedback] = useState('');

  const itemAisles = useMemo(() => {
    const values = (item?.locations || [])
      .map((loc) => String(loc?.location?.aisle?.aisleNumber || '').trim())
      .filter(Boolean);
    return new Set(values);
  }, [item]);

  const copyUpc = async () => {
    if (!item?.upc) {
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(item.upc);
      } else {
        const input = document.createElement('input');
        input.value = item.upc;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopyFeedback('Copied');
      setTimeout(() => setCopyFeedback(''), 1200);
    } catch {
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(''), 1200);
    }
  };

  return (
    <div className="customer-item-overlay" onClick={onClose}>
      <div className="customer-item-overlay-hint">Click anywhere outside this card to close this menu</div>
      <section className="customer-item-card" onClick={(event) => event.stopPropagation()}>
        <div className="customer-item-card__header">
          <div>
            <h2>{item?.name || 'Item'}</h2>
            <p className="customer-item-card__stock">{getTotalOnHand(item)} quantity on hand</p>
          </div>
          <div className="customer-item-card__image">
            {item?.imageUrl ? (
              <img src={item.imageUrl} alt={item?.name || 'Item'} />
            ) : (
              <div className="customer-item-card__image-placeholder">ITEM IMAGE HERE</div>
            )}
          </div>
        </div>

        <div className="customer-item-card__field">
          <span className="customer-item-card__label">Price</span>
          <strong>{toCurrency(item?.price)}/ea</strong>
        </div>

        <div className="customer-item-card__field customer-item-card__field--row">
          <div>
            <span className="customer-item-card__label">UPC</span>
            <strong>{item?.upc || '—'}</strong>
          </div>
          <button type="button" className="customer-item-card__copy-button" onClick={copyUpc}>Copy</button>
        </div>
        {copyFeedback && <p className="customer-item-card__feedback">{copyFeedback}</p>}

        <div className="customer-item-card__field">
          <span className="customer-item-card__label">Category</span>
          <strong>{item?.category || 'Uncategorized'}</strong>
        </div>

        <div className="customer-item-card__field">
          <span className="customer-item-card__label">Location</span>
          <strong>{getLocationLabel(item)}</strong>
        </div>

        <div className="customer-item-card__map">
          <StoreMapPreview
            aisles={aisles || []}
            highlightedAisleNumbers={Array.from(itemAisles)}
            title="Store Map"
            emptyMessage="Map unavailable for this store"
          />
        </div>

        <div className="customer-item-card__quantity" aria-label={`${item?.name || 'Item'} quantity`}>
          <button
            type="button"
            className="customer-item-card__quantity-button"
            onClick={onDecrease}
            disabled={!canDecrease}
            aria-label={`Decrease ${item?.name || 'item'} quantity`}
          >
            -
          </button>
          <span className="customer-item-card__quantity-value">{quantity}</span>
          <button
            type="button"
            className="customer-item-card__quantity-button"
            onClick={onIncrease}
            disabled={!canIncrease}
            aria-label={`Increase ${item?.name || 'item'} quantity`}
          >
            +
          </button>
        </div>

        <button
          type="button"
          className="customer-item-card__add-button"
          disabled={isOutOfStock || isAdding}
          onClick={onAddToCart}
        >
          {isOutOfStock ? 'Out of stock' : isAdding ? 'Adding...' : 'Add to Cart'}
        </button>
      </section>
    </div>
  );
};

export default CustomerItemDetailCard;