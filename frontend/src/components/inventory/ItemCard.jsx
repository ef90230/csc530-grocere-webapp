import React, { useMemo, useState } from 'react';
import './ItemCard.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const toCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '$0.00';
  }
  return `$${numeric.toFixed(2)}`;
};

const getAisleLabel = (locationRow) => {
  const aisle = locationRow?.location?.aisle;
  const aisleNumber = aisle?.aisleNumber ?? '—';
  const section = locationRow?.location?.section;
  if (!section) {
    return `Aisle ${aisleNumber}`;
  }
  return `Aisle ${aisleNumber} • Section ${section}`;
};

const ItemCard = ({ item, aisles, onClose, onItemUpdated }) => {
  const [mode, setMode] = useState('view');
  const [copyFeedback, setCopyFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editValues, setEditValues] = useState({
    name: item?.name || '',
    price: item?.price || '',
    category: item?.category || ''
  });
  const [quantityValues, setQuantityValues] = useState(() => {
    const initial = {};
    (item?.locations || []).forEach((loc) => {
      initial[loc.id] = Number(loc.quantityOnHand || 0);
    });
    return initial;
  });

  const totalQuantity = useMemo(() => {
    return (item?.locations || []).reduce((sum, loc) => sum + Number(loc.quantityOnHand || 0), 0);
  }, [item]);

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

  const saveItemInfo = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/items/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: editValues.name,
          price: Number(editValues.price),
          category: editValues.category
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to update item.');
      }

      const updatedItem = {
        ...item,
        ...payload.item,
        locations: item.locations || []
      };

      onItemUpdated(updatedItem);
      setMode('view');
    } catch (updateError) {
      setError(updateError.message || 'Unable to update item.');
    } finally {
      setSaving(false);
    }
  };

  const saveQuantities = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const updatedLocations = [...(item.locations || [])];

      for (const locationRow of updatedLocations) {
        const nextQuantity = Number(quantityValues[locationRow.id]);
        const response = await fetch(
          `${API_BASE}/api/items/${item.id}/location/${locationRow.locationId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              quantityOnHand: Number.isFinite(nextQuantity) ? Math.max(0, nextQuantity) : 0,
              storeId: locationRow.storeId
            })
          }
        );

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'Unable to update quantity.');
        }

        locationRow.quantityOnHand = payload.itemLocation.quantityOnHand;
      }

      onItemUpdated({
        ...item,
        locations: updatedLocations
      });
      setMode('view');
    } catch (updateError) {
      setError(updateError.message || 'Unable to update quantity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="item-card-overlay" onClick={onClose}>
      <div className="item-card-overlay-hint">Click anywhere outside this card to close this menu</div>
      <section className="item-card" onClick={(event) => event.stopPropagation()}>
        {mode === 'view' && (
          <>
            <div className="item-card-header">
              <div>
                <h2>{item.name}</h2>
                <p className="item-card-stock">{totalQuantity} quantity on hand</p>
              </div>
              <div className="item-card-image">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} />
                ) : (
                  <div className="item-card-image-placeholder">ITEM IMAGE HERE</div>
                )}
              </div>
            </div>

            <div className="item-card-field">
              <span className="field-label">Price</span>
              <strong>{toCurrency(item.price)}/ea</strong>
            </div>

            <div className="item-card-field upc-row">
              <div>
                <span className="field-label">UPC</span>
                <strong>{item.upc}</strong>
              </div>
              <button type="button" className="action-button" onClick={copyUpc}>Copy</button>
            </div>
            {copyFeedback && <p className="item-card-feedback">{copyFeedback}</p>}

            <div className="item-card-field">
              <span className="field-label">Category</span>
              <strong>{item.category}</strong>
            </div>

            <div className="item-card-field upc-row">
              <div>
                <span className="field-label">Location</span>
                {(item.locations || []).length > 0 ? (
                  <ul className="location-list">
                    {item.locations.map((loc) => (
                      <li key={loc.id}>{getAisleLabel(loc)}</li>
                    ))}
                  </ul>
                ) : (
                  <strong>No location assigned</strong>
                )}
              </div>
              <button type="button" className="action-button" onClick={() => {}}>Edit</button>
            </div>

            <div className="item-card-map">
              <div className="map-title">Store Map</div>
              <div className="map-grid">
                {(aisles || []).map((aisle) => {
                  const aisleNumber = String(aisle.aisleNumber || '');
                  const isHighlighted = itemAisles.has(aisleNumber);
                  return (
                    <div
                      key={aisle.id || aisleNumber}
                      className={`map-aisle ${isHighlighted ? 'highlighted' : ''}`}
                    >
                      Aisle {aisleNumber}
                    </div>
                  );
                })}
                {(!aisles || aisles.length === 0) && (
                  <div className="map-empty">Map unavailable for this store</div>
                )}
              </div>
            </div>

            <div className="item-card-actions">
              <button type="button" className="action-button full" onClick={() => setMode('editInfo')}>Edit Info</button>
              <button type="button" className="action-button full" onClick={() => setMode('adjustQuantity')}>Adjust Quantity</button>
              <button type="button" className="delete-button" onClick={() => {}}>Delete From System</button>
            </div>
          </>
        )}

        {mode === 'editInfo' && (
          <form className="item-form" onSubmit={saveItemInfo}>
            <h3>Edit Item Info</h3>
            <label>
              Name
              <input
                type="text"
                value={editValues.name}
                onChange={(event) => setEditValues((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label>
              Price
              <input
                type="number"
                step="0.01"
                min="0"
                value={editValues.price}
                onChange={(event) => setEditValues((prev) => ({ ...prev, price: event.target.value }))}
                required
              />
            </label>
            <label>
              Category
              <input
                type="text"
                value={editValues.category}
                onChange={(event) => setEditValues((prev) => ({ ...prev, category: event.target.value }))}
                required
              />
            </label>
            {error && <p className="item-card-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="action-button" onClick={() => setMode('view')} disabled={saving}>Cancel</button>
              <button type="submit" className="action-button" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        )}

        {mode === 'adjustQuantity' && (
          <form className="item-form" onSubmit={saveQuantities}>
            <h3>Change Quantity</h3>
            {(item.locations || []).length === 0 && <p>No locations available to update.</p>}
            {(item.locations || []).map((locationRow) => (
              <label key={locationRow.id}>
                {getAisleLabel(locationRow)}
                <input
                  type="number"
                  min="0"
                  value={quantityValues[locationRow.id] ?? 0}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuantityValues((prev) => ({
                      ...prev,
                      [locationRow.id]: value === '' ? '' : Number(value)
                    }));
                  }}
                />
              </label>
            ))}
            {error && <p className="item-card-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="action-button" onClick={() => setMode('view')} disabled={saving}>Cancel</button>
              <button type="submit" className="action-button" disabled={saving || (item.locations || []).length === 0}>{saving ? 'Saving...' : 'Save Quantity'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};

export default ItemCard;
