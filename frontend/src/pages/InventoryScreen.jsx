import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import ItemCard from '../components/inventory/ItemCard';
import './InventoryScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name (A‑Z)' },
  { value: 'name_desc', label: 'Name (Z‑A)' },
  { value: 'stock_desc', label: 'Lowest stock first' },
  { value: 'category', label: 'Category' },
  { value: 'aisle', label: 'Aisle location' },
  { value: 'noLocation', label: 'No location' }
];

const InventoryScreen = () => {
  const navigate = useNavigate();
  const userType = window.localStorage.getItem('userType');
  const isAdmin = userType === 'admin';
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [storeAisles, setStoreAisles] = useState([]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);

      const res = await fetch(`${API_BASE}/api/items?${params.toString()}`);
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
  }, [searchTerm]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const loadAislesForSelectedItem = async () => {
      if (!selectedItem) {
        setStoreAisles([]);
        return;
      }

      const storeId = selectedItem?.locations?.[0]?.storeId;
      if (!storeId) {
        setStoreAisles([]);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/aisles/store/${storeId}`);
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
  }, [selectedItem]);

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
      (item.locations || []).reduce((s, loc) => s + (loc.quantityOnHand || 0), 0);

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
        arr = arr.filter(i => !i.locations || i.locations.length === 0);
        break;
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name));
    }

    return arr;
  }, [items, searchTerm, sortBy]);

  const totalStock = item =>
    (item.locations || []).reduce((s, loc) => s + (loc.quantityOnHand || 0), 0);

  const handleItemUpdated = (updatedItem) => {
    setItems((prev) => prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
    setSelectedItem(updatedItem);
  };

  return (
    <div className="inventory-screen">
      <TopBar />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Inventory</h1>
          <button
            onClick={() => navigate('/map')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            View Map
          </button>
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
                    const aisle =
                      item.locations && item.locations[0] &&
                      item.locations[0].location &&
                      item.locations[0].location.aisle
                        ? item.locations[0].location.aisle.aisleNumber
                        : '';
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
          isAdmin={isAdmin}
          onClose={() => setSelectedItem(null)}
          onItemUpdated={handleItemUpdated}
        />
      )}
      <Navbar />
    </div>
  );
};

export default InventoryScreen;