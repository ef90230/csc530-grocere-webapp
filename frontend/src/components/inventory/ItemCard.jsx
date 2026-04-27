import React, { useMemo, useState } from 'react';
import './ItemCard.css';
import StoreMapPreview from '../common/StoreMapPreview';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:5000');

const toCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '$0.00';
  }
  return `$${numeric.toFixed(2)}`;
};

const toNonNegativeInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.round(parsed));
};

const normalizeTemperature = (value, fallback = 'ambient') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['ambient', 'chilled', 'frozen', 'hot'].includes(normalized) ? normalized : fallback;
};

const formatSectionLabel = (value) => {
  const match = String(value || '').match(/(\d+)/);
  return match ? match[1] : String(value || '').trim();
};

const getAisleLabel = (locationRow) => {
  const aisle = locationRow?.location?.aisle;
  const aisleNumber = aisle?.aisleNumber ?? '?';
  const section = formatSectionLabel(locationRow?.location?.section);
  if (!section) {
    return `Aisle ${aisleNumber}`;
  }
  return `Aisle ${aisleNumber} \u00B7 Section ${section}`;
};

const buildLocationOptions = (aisles = [], itemTemperature = 'ambient') => {
  const options = [];
  const resolvedTemperature = normalizeTemperature(itemTemperature);

  aisles.forEach((aisle) => {
    const aisleNumber = String(aisle?.aisleNumber || '').trim();
    (aisle?.locations || []).forEach((location) => {
      if (!location?.id) {
        return;
      }

      if (normalizeTemperature(location?.temperature) !== resolvedTemperature) {
        return;
      }

      const section = formatSectionLabel(location?.section);
      const label = section
        ? `Aisle ${aisleNumber || '?'} \u00B7 Section ${section}`
        : `Aisle ${aisleNumber || '?'} \u00B7 Unknown section`;

      options.push({
        locationId: Number(location.id),
        label
      });
    });
  });

  return options.sort((left, right) => left.label.localeCompare(right.label));
};

const ItemCard = ({ item, aisles, storeId, isAdmin, onClose, onItemUpdated, onItemDeleted }) => {
  const [mode, setMode] = useState('view');
  const [copyFeedback, setCopyFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [reassignLocationId, setReassignLocationId] = useState('');
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [addLocationId, setAddLocationId] = useState('');

  const [editValues, setEditValues] = useState({
    name: item?.name || '',
    price: item?.price || '',
    category: item?.category || '',
    isRestricted: String(item?.commodity || '').trim().toLowerCase() === 'restricted'
  });

  const [quantityValues, setQuantityValues] = useState(() => {
    const initial = {
      unassigned: toNonNegativeInteger(item?.unassignedQuantity, 0)
    };

    (item?.locations || []).forEach((loc) => {
      initial[loc.id] = toNonNegativeInteger(loc.quantityOnHand, 0);
    });
    return initial;
  });

  const resolvedStoreId = useMemo(() => {
    if (Number.isInteger(Number(storeId)) && Number(storeId) > 0) {
      return Number(storeId);
    }

    const firstStoreId = Number(item?.locations?.[0]?.storeId);
    return Number.isInteger(firstStoreId) && firstStoreId > 0 ? firstStoreId : null;
  }, [item, storeId]);

  const totalQuantity = useMemo(() => {
    const assigned = (item?.locations || []).reduce((sum, loc) => sum + Number(loc.quantityOnHand || 0), 0);
    return assigned + toNonNegativeInteger(item?.unassignedQuantity, 0);
  }, [item]);

  const itemAisles = useMemo(() => {
    const values = (item?.locations || [])
      .map((loc) => String(loc?.location?.aisle?.aisleNumber || '').trim())
      .filter(Boolean);
    return new Set(values);
  }, [item]);

  const locationOptions = useMemo(() => buildLocationOptions(aisles || [], item?.temperature), [aisles, item?.temperature]);

  const refreshItem = async () => {
    if (!resolvedStoreId) {
      return;
    }

    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE}/api/items/${item.id}?storeId=${resolvedStoreId}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.message || 'Unable to refresh item.');
    }

    onItemUpdated(payload.item);
    setQuantityValues({
      unassigned: toNonNegativeInteger(payload.item?.unassignedQuantity, 0),
      ...(payload.item?.locations || []).reduce((accumulator, loc) => {
        accumulator[loc.id] = toNonNegativeInteger(loc.quantityOnHand, 0);
        return accumulator;
      }, {})
    });
  };

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
          category: editValues.category,
          isRestricted: editValues.isRestricted
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to update item.');
      }

      const updatedItem = {
        ...item,
        ...payload.item,
        locations: item.locations || [],
        unassignedQuantity: toNonNegativeInteger(item?.unassignedQuantity, 0)
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

    if (!resolvedStoreId) {
      setError('Store not found for this item.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');

      const desiredUnassigned = toNonNegativeInteger(quantityValues.unassigned, 0);
      const unassignedResponse = await fetch(`${API_BASE}/api/items/${item.id}/location/unassigned`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          quantityOnHand: desiredUnassigned,
          storeId: resolvedStoreId
        })
      });

      const unassignedPayload = await unassignedResponse.json().catch(() => ({}));
      if (!unassignedResponse.ok || !unassignedPayload.success) {
        throw new Error(unassignedPayload.message || 'Unable to update Unassigned quantity.');
      }

      for (const locationRow of item.locations || []) {
        const nextQuantity = toNonNegativeInteger(quantityValues[locationRow.id], 0);
        const response = await fetch(`${API_BASE}/api/items/${item.id}/location/${locationRow.locationId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            quantityOnHand: nextQuantity,
            storeId: resolvedStoreId
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'Unable to update quantity.');
        }
      }

      await refreshItem();
      setMode('view');
    } catch (updateError) {
      setError(updateError.message || 'Unable to update quantity.');
    } finally {
      setSaving(false);
    }
  };

  const openManageLocations = () => {
    setError('');
    setEditingLocationId(null);
    setReassignLocationId('');
    setIsAddLocationOpen(false);
    setAddLocationId('');
    setMode('manageLocations');
  };

  const addLocationAssignment = async () => {
    if (!resolvedStoreId) {
      setError('Store not found for this item.');
      return;
    }

    const targetLocationId = Number(addLocationId);
    if (!Number.isInteger(targetLocationId) || targetLocationId < 1) {
      setError('Select a valid location to add.');
      return;
    }

    setActionLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/items/${item.id}/locations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          storeId: resolvedStoreId,
          locationId: targetLocationId
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to add location assignment.');
      }

      await refreshItem();
      setIsAddLocationOpen(false);
      setAddLocationId('');
    } catch (updateError) {
      setError(updateError.message || 'Unable to add location assignment.');
    } finally {
      setActionLoading(false);
    }
  };

  const saveReassignedLocation = async (sourceLocationId) => {
    if (!resolvedStoreId) {
      setError('Store not found for this item.');
      return;
    }

    const targetLocationId = Number(reassignLocationId);
    if (!Number.isInteger(targetLocationId) || targetLocationId < 1) {
      setError('Select a target location.');
      return;
    }

    setActionLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/items/${item.id}/locations/${sourceLocationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          storeId: resolvedStoreId,
          targetLocationId
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to reassign location.');
      }

      await refreshItem();
      setEditingLocationId(null);
      setReassignLocationId('');
    } catch (updateError) {
      setError(updateError.message || 'Unable to reassign location.');
    } finally {
      setActionLoading(false);
    }
  };

  const deleteLocationAssignment = async (locationId) => {
    if (!resolvedStoreId) {
      setError('Store not found for this item.');
      return;
    }

    setActionLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/items/${item.id}/locations/${locationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          storeId: resolvedStoreId
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to delete location assignment.');
      }

      await refreshItem();
    } catch (updateError) {
      setError(updateError.message || 'Unable to delete location assignment.');
    } finally {
      setActionLoading(false);
    }
  };

  const deleteItemFromSystem = async () => {
    setActionLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/items/${item.id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to delete item.');
      }

      setIsDeleteDialogOpen(false);
      if (typeof onItemDeleted === 'function') {
        onItemDeleted(item.id);
      }
      onClose();
    } catch (updateError) {
      setError(updateError.message || 'Unable to delete item.');
    } finally {
      setActionLoading(false);
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
                    {(item.locations || []).map((loc) => (
                      <li key={loc.id}>{getAisleLabel(loc)} ({toNonNegativeInteger(loc.quantityOnHand, 0)})</li>
                    ))}
                  </ul>
                ) : (
                  <strong>No Location</strong>
                )}
              </div>
              <button type="button" className="action-button" onClick={openManageLocations}>Edit</button>
            </div>

            <div className="item-card-map">
              <StoreMapPreview
                aisles={aisles || []}
                highlightedAisleNumbers={Array.from(itemAisles)}
                title="Store Map"
                emptyMessage="Map unavailable for this store"
              />
            </div>

            <div className="item-card-actions">
              {isAdmin ? (
                <button type="button" className="action-button full" onClick={() => setMode('editInfo')}>Edit Info</button>
              ) : null}
              <button type="button" className="action-button full" onClick={() => setMode('adjustQuantity')}>Adjust Quantity</button>
              {isAdmin ? (
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Deleting...' : 'Delete Item From System'}
                </button>
              ) : null}
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
            <label className="item-form-checkbox">
              <input
                type="checkbox"
                checked={editValues.isRestricted}
                onChange={(event) => setEditValues((prev) => ({ ...prev, isRestricted: event.target.checked }))}
              />
              <span>Restricted</span>
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
            <label>
              Unassigned (No Location)
              <input
                type="number"
                min="0"
                value={quantityValues.unassigned ?? 0}
                onChange={(event) => {
                  const value = event.target.value;
                  setQuantityValues((prev) => ({ ...prev, unassigned: value === '' ? '' : Number(value) }));
                }}
              />
            </label>
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
            <p className="item-card-hint">
              Decreasing a location increases Unassigned. Increasing a location uses Unassigned stock.
            </p>
            {error && <p className="item-card-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="action-button" onClick={() => setMode('view')} disabled={saving}>Cancel</button>
              <button type="submit" className="action-button" disabled={saving}>{saving ? 'Saving...' : 'Save Quantity'}</button>
            </div>
          </form>
        )}

        {mode === 'manageLocations' && (
          <section className="item-form item-locations-form">
            <h3>Edit Location Assignments</h3>

            {(item.locations || []).length === 0 ? (
              <p>No location assignments yet.</p>
            ) : (
              <ul className="item-location-edit-list">
                {(item.locations || []).map((locationRow) => (
                  <li key={locationRow.id} className="item-location-edit-row">
                    <div>
                      <p className="item-location-label">{getAisleLabel(locationRow)}</p>
                      <p className="item-location-qty">Qty: {toNonNegativeInteger(locationRow.quantityOnHand, 0)}</p>
                    </div>

                    {editingLocationId === locationRow.locationId ? (
                      <div className="item-location-edit-controls">
                        <select
                          value={reassignLocationId}
                          onChange={(event) => setReassignLocationId(event.target.value)}
                        >
                          <option value="">Select a new location</option>
                          {locationOptions.map((option) => (
                            <option key={option.locationId} value={option.locationId}>{option.label}</option>
                          ))}
                        </select>
                        <div className="item-location-button-row">
                          <button
                            type="button"
                            className="action-button"
                            onClick={() => saveReassignedLocation(locationRow.locationId)}
                            disabled={actionLoading}
                          >
                            {actionLoading ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="action-button"
                            onClick={() => {
                              setEditingLocationId(null);
                              setReassignLocationId('');
                            }}
                            disabled={actionLoading}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="item-location-button-row">
                        <button
                          type="button"
                          className="action-button"
                          onClick={() => {
                            setEditingLocationId(locationRow.locationId);
                            setReassignLocationId('');
                          }}
                          disabled={actionLoading}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => deleteLocationAssignment(locationRow.locationId)}
                          disabled={actionLoading}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!isAddLocationOpen ? (
              <button
                type="button"
                className="add-location-button"
                onClick={() => setIsAddLocationOpen(true)}
                disabled={actionLoading}
              >
                Add Location
              </button>
            ) : (
              <div className="item-location-add-panel">
                <select value={addLocationId} onChange={(event) => setAddLocationId(event.target.value)}>
                  <option value="">Select a location</option>
                  {locationOptions.map((option) => (
                    <option key={option.locationId} value={option.locationId}>{option.label}</option>
                  ))}
                </select>
                <div className="item-location-button-row">
                  <button
                    type="button"
                    className="action-button"
                    onClick={addLocationAssignment}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Adding...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => {
                      setIsAddLocationOpen(false);
                      setAddLocationId('');
                    }}
                    disabled={actionLoading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {error && <p className="item-card-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="action-button" onClick={() => setMode('view')} disabled={actionLoading}>Done</button>
            </div>
          </section>
        )}
      </section>

      {isDeleteDialogOpen ? (
        <div
          className="item-delete-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            event.stopPropagation();
            if (!actionLoading) {
              setIsDeleteDialogOpen(false);
            }
          }}
        >
          <section
            className="item-delete-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Delete Item Confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Delete Item From System</h2>
            <p className="item-delete-warning-copy">
              Are you sure you wish to delete this item? The item will be removed from all locations in the store, and any orders containing that item, picked or not, will have that item canceled. Final totals will be adjusted accordingly.
            </p>
            <div className="item-delete-modal-actions">
              <button
                type="button"
                className="item-delete-modal-btn item-delete-modal-btn--ghost"
                onClick={() => setIsDeleteDialogOpen(false)}
                disabled={actionLoading}
              >
                Keep Item
              </button>
              <button
                type="button"
                className="item-delete-modal-btn item-delete-modal-btn--danger"
                disabled={actionLoading}
                onClick={deleteItemFromSystem}
              >
                {actionLoading ? 'Deleting...' : 'Delete Item'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default ItemCard;
