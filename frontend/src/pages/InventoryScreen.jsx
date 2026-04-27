import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import ItemCard from '../components/inventory/ItemCard';
import './InventoryScreen.css';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:5000');

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name (A‑Z)' },
  { value: 'name_desc', label: 'Name (Z‑A)' },
  { value: 'stock_desc', label: 'Lowest stock first' },
  { value: 'category', label: 'Category' },
  { value: 'aisle', label: 'Aisle location' },
  { value: 'noLocation', label: 'No location' }
];

const INVALID_UPC_MESSAGE = 'This is not a valid UPC code. Please try again or look up manually with the search bar.';

export const normalizeUpcDigits = (value = '') => String(value || '').replace(/\D/g, '');

const isValidUpcA = (digits) => {
  if (!/^\d{12}$/.test(digits)) {
    return false;
  }

  const checkDigit = Number(digits[11]);
  let sum = 0;
  for (let index = 0; index < 11; index += 1) {
    const digit = Number(digits[index]);
    sum += index % 2 === 0 ? digit * 3 : digit;
  }

  return ((10 - (sum % 10)) % 10) === checkDigit;
};

const convertUpcEtoUpcA = (upcE) => {
  if (!/^\d{8}$/.test(upcE)) {
    return null;
  }

  const numberSystem = upcE[0];
  const checkDigit = upcE[7];
  const d1 = upcE[1];
  const d2 = upcE[2];
  const d3 = upcE[3];
  const d4 = upcE[4];
  const d5 = upcE[5];
  const d6 = upcE[6];

  let upcABody;

  if (d6 === '0' || d6 === '1' || d6 === '2') {
    upcABody = `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  } else if (d6 === '3') {
    upcABody = `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}`;
  } else if (d6 === '4') {
    upcABody = `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}`;
  } else {
    upcABody = `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }

  return `${upcABody}${checkDigit}`;
};

export const toCanonicalUpc = (value = '') => {
  const digits = normalizeUpcDigits(value);

  if (digits.length === 12) {
    return isValidUpcA(digits) ? digits : null;
  }

  if (digits.length === 8) {
    const expanded = convertUpcEtoUpcA(digits);
    return expanded && isValidUpcA(expanded) ? expanded : null;
  }

  // Some scanners emit EAN-13 for UPC-A values with a leading 0.
  if (digits.length === 13 && digits.startsWith('0')) {
    const candidate = digits.slice(1);
    return isValidUpcA(candidate) ? candidate : null;
  }

  // Some scanners emit GTIN-14 with 00 + UPC-A.
  if (digits.length === 14 && digits.startsWith('00')) {
    const candidate = digits.slice(2);
    return isValidUpcA(candidate) ? candidate : null;
  }

  return null;
};

export const isValidUpcCode = (value = '') => {
  return Boolean(toCanonicalUpc(value));
};

const InventoryScreen = () => {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const userType = window.localStorage.getItem('userType');
  const isAdmin = userType === 'admin';
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [storeAisles, setStoreAisles] = useState([]);
  const [currentStoreId, setCurrentStoreId] = useState(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('');
  const [pendingCreateUpc, setPendingCreateUpc] = useState('');
  const [isCreatePromptOpen, setIsCreatePromptOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    upc: '',
    name: '',
    imageUrl: '',
    description: '',
    category: '',
    price: '',
    initialQuantity: '',
    temperature: 'ambient',
    weight: '',
    isRestricted: false
  });

  const scannerVideoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scannerHandlingRef = useRef(false);

  const fetchItems = useCallback(async () => {
    if (!Number.isInteger(currentStoreId) || currentStoreId < 1) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('storeId', String(currentStoreId));
      if (searchTerm) params.append('search', searchTerm);

      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/api/items?${params.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        throw new Error('Failed to load items');
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Unexpected response');
      }
      setItems(data.items || []);
    } catch (err) {
      console.error('Inventory fetch error', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, searchTerm]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const focusItemId = Number(routeLocation?.state?.focusItemId);
    if (!Number.isInteger(focusItemId) || items.length === 0) {
      return;
    }

    const matchedItem = items.find((item) => Number(item.id) === focusItemId);
    if (!matchedItem) {
      return;
    }

    setSelectedItem(matchedItem);
    navigate('/inventory', { replace: true, state: {} });
  }, [items, navigate, routeLocation?.state]);

  useEffect(() => {
    const token = localStorage.getItem('authToken');

    const loadProfile = async () => {
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

        const payload = await response.json().catch(() => ({}));
        const storeIdFromProfile = Number(payload?.user?.storeId);
        if (Number.isInteger(storeIdFromProfile) && storeIdFromProfile > 0) {
          setCurrentStoreId(storeIdFromProfile);
        }
      } catch {
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    const loadAislesForSelectedItem = async () => {
      if (!selectedItem) {
        setStoreAisles([]);
        return;
      }

      const selectedStoreId = Number(selectedItem?.locations?.[0]?.storeId) || Number(currentStoreId);
      if (!Number.isInteger(selectedStoreId) || selectedStoreId < 1) {
        setStoreAisles([]);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/aisles/store/${selectedStoreId}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          setStoreAisles([]);
          return;
        }
        setStoreAisles(payload.aisles || []);
      } catch {
        setStoreAisles([]);
      }
    };

    loadAislesForSelectedItem();
  }, [currentStoreId, selectedItem]);

  const processedItems = useMemo(() => {
    let arr = [...items];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      arr = arr.filter(
        i =>
          i.name.toLowerCase().includes(term) ||
          (i.upc && i.upc.toLowerCase().includes(term))
      );
    }

    const totalStock = item =>
      (item.locations || []).reduce((s, loc) => s + (loc.quantityOnHand || 0), 0)
      + Number(item?.unassignedQuantity || 0);

    const hasNoAssignedLocation = (item) =>
      (item.locations || []).length === 0;

    switch (sortBy) {
      case 'name_desc':
        arr.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'stock_desc':
        arr.sort((a, b) => totalStock(a) - totalStock(b));
        break;
      case 'category':
        arr.sort((a, b) => {
          if (a.category === b.category) return a.name.localeCompare(b.name);
          return (a.category || '').localeCompare(b.category || '');
        });
        break;
      case 'aisle':
        arr.sort((a, b) => {
          const aisleA =
            a.locations && a.locations[0] && a.locations[0].location &&
            a.locations[0].location.aisle
              ? a.locations[0].location.aisle.aisleNumber || ''
              : '';
          const aisleB =
            b.locations && b.locations[0] && b.locations[0].location &&
            b.locations[0].location.aisle
              ? b.locations[0].location.aisle.aisleNumber || ''
              : '';
          return aisleA.toString().localeCompare(aisleB.toString());
        });
        break;
      case 'noLocation':
        arr = arr.filter((item) => hasNoAssignedLocation(item));
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name));
    }

    return arr;
  }, [items, searchTerm, sortBy]);

  const totalStock = item =>
    (item.locations || []).reduce((s, loc) => s + (loc.quantityOnHand || 0), 0)
    + Number(item?.unassignedQuantity || 0);

  const handleItemUpdated = (updatedItem) => {
    setItems((prev) => prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
    setSelectedItem(updatedItem);
  };

  const handleItemDeleted = (deletedItemId) => {
    const deletedId = Number(deletedItemId);
    setItems((prev) => prev.filter((item) => Number(item.id) !== deletedId));
    setSelectedItem(null);
  };

  const stopScannerSession = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    scannerHandlingRef.current = false;

    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }
  };

  const closeScannerModal = () => {
    stopScannerSession();
    setIsScannerOpen(false);
  };

  const handleOpenScanner = async () => {
    setScannerMessage('');

    if (!navigator?.mediaDevices?.getUserMedia) {
      setScannerMessage('Camera unavailable');
      return;
    }

    setIsScannerOpen(true);
  };

  const handleScanResult = (rawValue) => {
    const scannedValue = String(rawValue || '').trim();
    const canonicalScanned = toCanonicalUpc(scannedValue);

    if (!canonicalScanned) {
      setScannerMessage(INVALID_UPC_MESSAGE);
      return;
    }

    const matchedItem = items.find((item) => toCanonicalUpc(item?.upc) === canonicalScanned);

    if (matchedItem) {
      closeScannerModal();
      setSelectedItem(matchedItem);
      return;
    }

    closeScannerModal();
    setPendingCreateUpc(canonicalScanned);
    setIsCreatePromptOpen(true);
  };

  const closeCreatePrompt = () => {
    setIsCreatePromptOpen(false);
    setPendingCreateUpc('');
  };

  const openCreateModal = (prefilledUpc = '') => {
    setCreateError('');
    setCreateForm({
      upc: prefilledUpc,
      name: '',
      imageUrl: '',
      description: '',
      category: '',
      price: '',
      initialQuantity: '',
      temperature: 'ambient',
      weight: '',
      isRestricted: false
    });
    setIsCreatePromptOpen(false);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setPendingCreateUpc('');
    setCreateError('');
  };

  const submitCreateItem = async (event) => {
    event.preventDefault();
    setIsCreatingItem(true);
    setCreateError('');

    try {
      if (!Number.isInteger(currentStoreId) || currentStoreId < 1) {
        throw new Error('Unable to determine the current store for this item.');
      }

      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          upc: normalizeUpcDigits(createForm.upc),
          name: createForm.name,
          imageUrl: createForm.imageUrl || null,
          description: createForm.description || null,
          category: createForm.category,
          department: createForm.category,
          price: Number(createForm.price),
          storeId: currentStoreId,
          temperature: createForm.temperature,
          weight: createForm.weight === '' ? null : Number(createForm.weight),
          unassignedQuantity: createForm.initialQuantity === '' ? 0 : Math.max(0, Number(createForm.initialQuantity) || 0),
          isRestricted: createForm.isRestricted
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to create inventory item.');
      }

      const createdItem = {
        ...payload.item,
        locations: Array.isArray(payload?.item?.locations) ? payload.item.locations : [],
        unassignedQuantity: Number(payload?.item?.unassignedQuantity || 0)
      };

      setItems((previous) => [...previous, createdItem]);
      setSelectedItem(createdItem);
      closeCreateModal();
      setSearchTerm('');
    } catch (creationError) {
      setCreateError(creationError.message || 'Unable to create inventory item.');
    } finally {
      setIsCreatingItem(false);
    }
  };

  useEffect(() => {
    if (!isScannerOpen || !scannerVideoRef.current) {
      return undefined;
    }

    const reader = new BrowserMultiFormatReader();
    scannerHandlingRef.current = false;
    const videoEl = scannerVideoRef.current;

    const startReader = async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoEl,
          (result) => {
            if (!result || scannerHandlingRef.current) return;

            const rawValue = String(result.getText() || '').trim();
            if (!rawValue) return;

            scannerHandlingRef.current = true;
            handleScanResult(rawValue);
            scannerHandlingRef.current = false;
          }
        );
        scannerControlsRef.current = controls;
      } catch (scanError) {
        console.error('Unable to start barcode scanner', scanError);
        setIsScannerOpen(false);
        setScannerMessage('Camera unavailable');
      }
    };

    startReader();

    return () => {
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
      scannerHandlingRef.current = false;
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScannerOpen]);

  useEffect(() => () => {
    stopScannerSession();
  }, []);

  return (
    <div className="inventory-screen">
      <TopBar title="Store Inventory" />
      <div className="page-content">
        <div className="inventory-title-row">
          <h1>Inventory</h1>
          <div className="inventory-title-actions">
            {isAdmin ? (
              <button
                type="button"
                className="inventory-title-action-btn inventory-title-action-btn--green"
                onClick={() => openCreateModal()}
              >
                Add Item
              </button>
            ) : null}
            <button
              type="button"
              className="inventory-title-action-btn"
              onClick={handleOpenScanner}
            >
              Scan
            </button>
            <button
              type="button"
              className="inventory-title-action-btn"
              onClick={() => navigate('/map')}
            >
              View Map
            </button>
          </div>
        </div>
        <div className="toolbar inventory-toolbar">
          <input
            type="text"
            className="inventory-search-input"
            placeholder="Search by name or UPC"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <select
            className="inventory-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {loading && <p>Loading items…</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {!loading && !error && (
          <div className="inventory-table">
            <div className="inventory-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>UPC</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>Aisle</th>
                  </tr>
                </thead>
                <tbody>
                  {processedItems.map(item => {
                    const stock = totalStock(item);
                    const firstLocation = (item.locations || []).find((locationRow) => locationRow?.location?.aisle);
                    const aisle =
                      firstLocation && firstLocation.location && firstLocation.location.aisle
                        ? firstLocation.location.aisle.aisleNumber
                        : 'No Location';
                    return (
                      <tr key={item.id} className="inventory-row" onClick={() => setSelectedItem(item)}>
                        <td>{item.name}</td>
                        <td>{item.upc}</td>
                        <td>{item.category}</td>
                        <td>{stock}</td>
                        <td>{aisle}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {processedItems.length === 0 && <p>No items found.</p>}
          </div>
        )}
      </div>
      {selectedItem && (
        <ItemCard
          item={selectedItem}
          aisles={storeAisles}
          storeId={currentStoreId}
          isAdmin={isAdmin}
          onClose={() => setSelectedItem(null)}
          onItemUpdated={handleItemUpdated}
          onItemDeleted={handleItemDeleted}
        />
      )}
      {isScannerOpen ? (
        <div className="inventory-modal-overlay" role="presentation" onClick={closeScannerModal}>
          <section className="inventory-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Scan UPC Barcode</h3>
            <p>Point the camera at the barcode.</p>
            {scannerMessage ? <p className="inventory-message-error">{scannerMessage}</p> : null}
            <video ref={scannerVideoRef} className="inventory-scanner-video" autoPlay playsInline muted />
            <button type="button" className="inventory-modal-close" onClick={closeScannerModal}>
              Close
            </button>
          </section>
        </div>
      ) : null}
      {isCreatePromptOpen ? (
        <div className="inventory-modal-overlay" role="presentation" onClick={closeCreatePrompt}>
          <section className="inventory-modal" onClick={(event) => event.stopPropagation()}>
            <h3>UPC Not Found</h3>
            <p>No inventory item matched UPC {pendingCreateUpc}. Create a new inventory item with this UPC?</p>
            <div className="inventory-modal-actions">
              <button type="button" className="inventory-modal-btn inventory-modal-btn--ghost" onClick={closeCreatePrompt}>
                Cancel
              </button>
              <button
                type="button"
                className="inventory-modal-btn"
                onClick={() => {
                  if (!isAdmin) {
                    setError('Only admins can create new inventory items.');
                    closeCreatePrompt();
                    return;
                  }
                  openCreateModal(pendingCreateUpc);
                }}
              >
                Create Item
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isCreateModalOpen ? (
        <div className="inventory-modal-overlay" role="presentation" onClick={closeCreateModal}>
          <section className="inventory-modal inventory-modal--form" onClick={(event) => event.stopPropagation()}>
            <h3>Create Inventory Item</h3>
            <form className="inventory-create-form" onSubmit={submitCreateItem}>
              <label>
                UPC
                <input
                  type="text"
                  value={createForm.upc}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, upc: event.target.value }))}
                  required
                />
              </label>
              <label>
                Name
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Image Link
                <input
                  type="text"
                  value={createForm.imageUrl}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, imageUrl: event.target.value }))}
                  placeholder="https://example.com/item.jpg"
                />
              </label>
              <label>
                Price
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={createForm.price}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, price: event.target.value }))}
                  required
                />
              </label>
              <label>
                Category
                <input
                  type="text"
                  value={createForm.category}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, category: event.target.value }))}
                  required
                />
              </label>
              <label>
                Initial Quantity
                <input
                  type="number"
                  min="0"
                  value={createForm.initialQuantity}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, initialQuantity: event.target.value }))}
                  placeholder="0"
                />
              </label>
              <label>
                Temperature
                <select
                  value={createForm.temperature}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, temperature: event.target.value }))}
                  required
                >
                  <option value="ambient">Ambient</option>
                  <option value="chilled">Chilled</option>
                  <option value="frozen">Frozen</option>
                  <option value="hot">Hot</option>
                </select>
              </label>
              <label className="inventory-checkbox-field">
                <input
                  type="checkbox"
                  checked={createForm.isRestricted}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, isRestricted: event.target.checked }))}
                />
                <span>Restricted</span>
              </label>
              <label>
                Weight in Pounds
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={createForm.weight}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, weight: event.target.value }))}
                />
              </label>
              <label>
                Description
                <textarea
                  rows="4"
                  value={createForm.description}
                  onChange={(event) => setCreateForm((previous) => ({ ...previous, description: event.target.value }))}
                />
              </label>
              {createError ? <p className="inventory-message-error">{createError}</p> : null}
              <div className="inventory-modal-actions">
                <button type="button" className="inventory-modal-btn inventory-modal-btn--ghost" onClick={closeCreateModal}>
                  Cancel
                </button>
                <button type="submit" className="inventory-modal-btn" disabled={isCreatingItem}>
                  {isCreatingItem ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      <Navbar />
    </div>
  );
};

export default InventoryScreen;