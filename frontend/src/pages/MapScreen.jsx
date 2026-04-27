import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './MapScreen.css';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:5000');

const GRID_SIZE = 40; // pixels per grid cell

const COMMODITY_COLORS = {
  ambient: '#1a1a1a',
  chilled: '#87CEEB',
  frozen: '#1a5276',
  hot: '#FF6B35',
};
const COMMODITY_LABELS = { ambient: 'Ambient', chilled: 'Chilled', frozen: 'Frozen', hot: 'Hot' };
const TEMPERATURE_OPTIONS = ['ambient', 'chilled', 'frozen', 'hot'];

const compareAisleNumbers = (left, right) => String(left || '').localeCompare(String(right || ''), undefined, { numeric: true, sensitivity: 'base' });

const parseSectionOrdinal = (value) => {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
};

const formatSectionLabel = (sectionValue) => {
  const ordinal = parseSectionOrdinal(sectionValue);
  return ordinal ? `Section ${ordinal}` : `Section ${String(sectionValue || '?').trim() || '?'}`;
};

const normalizeTemperature = (value, fallback = 'ambient') => {
  const normalized = String(value || '').trim().toLowerCase();
  return TEMPERATURE_OPTIONS.includes(normalized) ? normalized : fallback;
};

const sortLocationsBySection = (locations = []) => {
  return [...locations].sort((left, right) => {
    const leftOrdinal = parseSectionOrdinal(left?.section);
    const rightOrdinal = parseSectionOrdinal(right?.section);
    if (leftOrdinal !== null && rightOrdinal !== null) {
      return leftOrdinal - rightOrdinal;
    }
    return String(left?.section || '').localeCompare(String(right?.section || ''), undefined, { numeric: true, sensitivity: 'base' });
  });
};

const normalizeAislesPayload = (aisles = []) => {
  return [...aisles]
    .map((aisle, index) => ({
      ...aisle,
      aisleName: String(aisle?.aisleName || ''),
      coordinates: aisle.coordinates || {
        x: index * 2,
        y: Math.floor(index / 5) * 2
      },
      locations: sortLocationsBySection(aisle.locations || [])
    }))
    .sort((left, right) => compareAisleNumbers(left?.aisleNumber, right?.aisleNumber));
};

const createDialogState = () => ({
  isOpen: false,
  title: '',
  message: '',
  confirmLabel: 'OK',
  cancelLabel: '',
  confirmVariant: 'primary',
  onConfirm: null,
  closeOnBackdrop: true
});

const formatAisleDescriptor = (aisle) => {
  const aisleNumber = String(aisle?.aisleNumber || '').trim();
  const aisleName = String(aisle?.aisleName || '').trim();
  return aisleName ? `${aisleNumber} — ${aisleName}` : aisleNumber;
};

const MapScreen = () => {
  const navigate = useNavigate();
  const userType = window.localStorage.getItem('userType');
  const isAdmin = userType === 'admin';
  const [storeId, setStoreId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [aisles, setAisles] = useState([]);
  const [originalAisles, setOriginalAisles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const canvasRef = useRef(null);
  const draggingIdRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef(null);

  // Hover state for cursor changes
  const [hoveredAisleId, setHoveredAisleId] = useState(null);

  // Mode state
  const [mode, setMode] = useState('view'); // 'view' or 'editing'

  const [showAisleEditorModal, setShowAisleEditorModal] = useState(false);
  const [aisleEditorBusy, setAisleEditorBusy] = useState(false);
  const [appDialog, setAppDialog] = useState(createDialogState);
  const [sectionItemsModal, setSectionItemsModal] = useState({
    isOpen: false,
    loading: false,
    location: null,
    items: [],
    error: ''
  });

  // Pick paths
  const [pickPaths, setPickPaths] = useState([]);
  // Add path modal
  const [showAddPathModal, setShowAddPathModal] = useState(false);
  const [addCommodity, setAddCommodity] = useState('ambient');
  const [addAisleOrder, setAddAisleOrder] = useState([]);
  // Edit path modal
  const [showEditPathModal, setShowEditPathModal] = useState(false);
  const [editingPathId, setEditingPathId] = useState(null);
  const [editAisleOrder, setEditAisleOrder] = useState([]);
  // Delete path modal
  const [showDeletePathModal, setShowDeletePathModal] = useState(false);
  const [deletingPathId, setDeletingPathId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem('authToken');
    if (!token) {
      return;
    }

    const loadAuthContext = async () => {
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
        const user = payload?.user || {};
        setCurrentUserId(Number(user?.id) || null);
        setStoreId(Number(user?.storeId || user?.preferredStoreId) || null);
      } catch {
      }
    };

    loadAuthContext();
  }, []);

  useEffect(() => {
    if (!isAdmin && mode !== 'view') {
      setMode('view');
    }
  }, [isAdmin, mode]);

  const getCanvasPoint = e => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const fetchAisles = useCallback(async () => {
    if (!storeId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/aisles/store/${storeId}`);
      if (!res.ok) {
        throw new Error('Failed to load aisles');
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Unexpected response');
      }
      
      const aislesWithCoords = normalizeAislesPayload(data.aisles || []);

      setAisles(aislesWithCoords);
      setOriginalAisles(JSON.parse(JSON.stringify(aislesWithCoords)));
    } catch (err) {
      console.error('Fetch aisles error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const fetchPickPaths = useCallback(async () => {
    if (!storeId) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/pickpaths/store/${storeId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setPickPaths(data.pickPaths || []);
    } catch (err) {
      console.error('Fetch pick paths error:', err);
    }
  }, [storeId]);

  useEffect(() => {
    if (!storeId) {
      return;
    }

    fetchAisles();
    fetchPickPaths();
  }, [storeId, fetchAisles, fetchPickPaths]);

  const buildLocationToAisleId = () => {
    const map = {};
    aisles.forEach(aisle => {
      if (aisle.locations && Array.isArray(aisle.locations)) {
        aisle.locations.forEach(loc => { map[loc.id] = aisle.id; });
      }
    });
    return map;
  };

  const getLocationsForAisleTemperature = useCallback((aisle, commodity) => {
    const temperature = normalizeTemperature(commodity);
    return sortLocationsBySection((aisle?.locations || []).filter((location) => normalizeTemperature(location?.temperature) === temperature));
  }, []);

  const hasEligibleSectionForCommodity = useCallback((aisle, commodity) => {
    return getLocationsForAisleTemperature(aisle, commodity).length > 0;
  }, [getLocationsForAisleTemperature]);

  const pathToAisleIds = path => {
    const map = buildLocationToAisleId();
    const seen = new Set();
    const ids = [];
    (path.pathSequence || []).forEach(locId => {
      const aisleId = map[locId];
      if (aisleId != null && !seen.has(aisleId)) { seen.add(aisleId); ids.push(aisleId); }
    });
    return ids;
  };

  const aisleIdsToPathSequence = (aisleIds, commodity) => {
    const locationIds = [];
    aisleIds.forEach(aisleId => {
      const aisle = aisles.find(a => a.id === aisleId);
      getLocationsForAisleTemperature(aisle, commodity).forEach(loc => locationIds.push(loc.id));
    });
    return locationIds;
  };

  const getAvailableAislesForCommodity = useCallback((commodity, excludedAisleIds = []) => {
    return aisles
      .filter((aisle) => typeof aisle.id === 'number' && !excludedAisleIds.includes(aisle.id) && hasEligibleSectionForCommodity(aisle, commodity))
      .sort((left, right) => compareAisleNumbers(left?.aisleNumber, right?.aisleNumber));
  }, [aisles, hasEligibleSectionForCommodity]);

  const editingPath = useMemo(() => pickPaths.find((path) => path.id === editingPathId) || null, [editingPathId, pickPaths]);

  const getAisleCoordinates = aisle => {
    if (aisle.coordinates) {
      return aisle.coordinates;
    }
    // Default positioning if no coordinates
    return { x: Math.random() * 200, y: Math.random() * 200 };
  };

  const findAisleAtPoint = point => {
    const { x, y } = point;
    for (const aisle of aisles) {
      const coords = getAisleCoordinates(aisle);
      const px = coords.x * GRID_SIZE;
      const py = coords.y * GRID_SIZE;
      const size = GRID_SIZE;
      if (x >= px && x <= px + size && y >= py && y <= py + size) {
        return aisle;
      }
    }
    return null;
  };

  const handleCanvasPointerDown = e => {
    if (mode !== 'editing') return; // Only allow interaction in editing mode

    e.preventDefault(); // Prevent default browser behavior

    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(e);
    if (!point) return;
    const { x, y } = point;

    const aisle = findAisleAtPoint({ x, y });
    if (!aisle) return;

    const coords = getAisleCoordinates(aisle);
    const px = coords.x * GRID_SIZE;
    const py = coords.y * GRID_SIZE;
    const nextOffset = {
      x: x - px,
      y: y - py
    };

    draggingIdRef.current = aisle.id;
    dragOffsetRef.current = nextOffset;
    pointerIdRef.current = e.pointerId;
    setDraggingId(aisle.id);
    canvas.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = e => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(e);
    if (!point) return;
    const { x, y } = point;

    // Check if hovering over an aisle for cursor changes
    const hovered = mode === 'editing' ? findAisleAtPoint({ x, y }) : null;
    const hoveredId = hovered ? hovered.id : null;
    setHoveredAisleId(hoveredId);

    // Handle dragging if in progress
    const activeDraggingId = draggingIdRef.current;
    const activeDragOffset = dragOffsetRef.current;
    if (mode !== 'editing' || activeDraggingId === null || pointerIdRef.current !== e.pointerId) return;

    e.preventDefault(); // Prevent default browser behavior

    const newX = Math.max(0, Math.min(19, Math.floor((x - activeDragOffset.x) / GRID_SIZE)));
    const newY = Math.max(0, Math.min(14, Math.floor((y - activeDragOffset.y) / GRID_SIZE)));

    setAisles(prev =>
      prev.map(aisle =>
        aisle.id === activeDraggingId
          ? {
              ...aisle,
              coordinates: { x: newX, y: newY }
            }
          : aisle
      )
    );

    setHasChanges(true);
  };

  const handleCanvasPointerUp = e => {
    const canvas = canvasRef.current;
    if (canvas && pointerIdRef.current !== null) {
      try {
        canvas.releasePointerCapture(pointerIdRef.current);
      } catch (captureError) {
        // Ignore if pointer capture was already released.
      }
    }

    draggingIdRef.current = null;
    dragOffsetRef.current = { x: 0, y: 0 };
    pointerIdRef.current = null;
    setDraggingId(null);
  };

  const handleCanvasPointerLeave = e => {
    setHoveredAisleId(null);
    if (draggingIdRef.current === null) return;
    handleCanvasPointerUp(e);
  };

  // Aisle management functions
  const addAisle = async () => {
    setAisleEditorBusy(true);
    setError(null);

    try {
      const nextIndex = aisles.length;
      const coordinates = {
        x: (nextIndex % 10) * 2,
        y: Math.floor(nextIndex / 10) * 2
      };

      const response = await fetch(`${API_BASE}/api/aisles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          coordinates
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to create aisle.');
      }

      await fetchAisles();
    } catch (err) {
      console.error('Add aisle error:', err);
      setError(err.message || 'Failed to create aisle.');
    } finally {
      setAisleEditorBusy(false);
    }
  };

  const deleteAisleById = async (aisle) => {
    if (!aisle?.id) {
      return;
    }

    setAppDialog({
      isOpen: true,
      title: 'Delete Aisle',
      message: `Are you sure you wish to delete aisle ${aisle.aisleNumber}? All sections and item assignments in that aisle will be removed.`,
      confirmLabel: 'Yes, Delete',
      cancelLabel: 'Cancel',
      confirmVariant: 'secondary',
      closeOnBackdrop: true,
      onConfirm: async () => {
        setAisleEditorBusy(true);
        setError(null);
        try {
          const response = await fetch(`${API_BASE}/api/aisles/${aisle.id}`, { method: 'DELETE' });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.success) {
            throw new Error(payload.message || 'Failed to delete aisle.');
          }

          closeAppDialog();
          await Promise.all([fetchAisles(), fetchPickPaths()]);
        } catch (err) {
          console.error('Delete aisle error:', err);
          setError(err.message || 'Failed to delete aisle.');
        } finally {
          setAisleEditorBusy(false);
        }
      }
    });
  };

  const addSectionToAisle = async (aisleId) => {
    setAisleEditorBusy(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/aisles/${aisleId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temperature: 'ambient' })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to add section.');
      }

      await fetchAisles();
    } catch (err) {
      console.error('Add section error:', err);
      setError(err.message || 'Failed to add section.');
    } finally {
      setAisleEditorBusy(false);
    }
  };

  const setAisleDescriptionDraft = useCallback((aisleId, nextValue) => {
    setAisles((currentAisles) => currentAisles.map((aisle) => (
      aisle.id === aisleId
        ? { ...aisle, aisleName: nextValue }
        : aisle
    )));
  }, []);

  const updateAisleDescription = async (aisle) => {
    if (!aisle?.id) {
      return;
    }

    const nextDescription = String(aisle?.aisleName || '').trim();
    const originalAisle = originalAisles.find((entry) => entry.id === aisle.id);
    const originalDescription = String(originalAisle?.aisleName || '').trim();

    if (nextDescription === originalDescription) {
      return;
    }

    setAisleEditorBusy(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/aisles/${aisle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aisleName: nextDescription })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to update aisle description.');
      }

      await fetchAisles();
    } catch (err) {
      console.error('Update aisle description error:', err);
      setError(err.message || 'Failed to update aisle description.');
      setAisles((currentAisles) => currentAisles.map((currentAisle) => (
        currentAisle.id === aisle.id
          ? { ...currentAisle, aisleName: originalDescription }
          : currentAisle
      )));
    } finally {
      setAisleEditorBusy(false);
    }
  };

  const updateSectionTemperature = async (locationId, temperature) => {
    setAisleEditorBusy(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/aisles/sections/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temperature })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to update section temperature.');
      }

      await Promise.all([fetchAisles(), fetchPickPaths()]);
    } catch (err) {
      console.error('Update section temperature error:', err);
      setError(err.message || 'Failed to update section temperature.');
    } finally {
      setAisleEditorBusy(false);
    }
  };

  const deleteSection = async (location) => {
    if (!location?.id) {
      return;
    }

    setAppDialog({
      isOpen: true,
      title: 'Delete Section',
      message: `Are you sure? ${formatSectionLabel(location.section)} will be deleted and its assigned items will return to Unassigned.`,
      confirmLabel: 'Yes, Delete',
      cancelLabel: 'Cancel',
      confirmVariant: 'secondary',
      closeOnBackdrop: true,
      onConfirm: async () => {
        setAisleEditorBusy(true);
        setError(null);

        try {
          const response = await fetch(`${API_BASE}/api/aisles/sections/${location.id}`, { method: 'DELETE' });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.success) {
            throw new Error(payload.message || 'Failed to delete section.');
          }

          closeAppDialog();
          await Promise.all([fetchAisles(), fetchPickPaths()]);
        } catch (err) {
          console.error('Delete section error:', err);
          setError(err.message || 'Failed to delete section.');
        } finally {
          setAisleEditorBusy(false);
        }
      }
    });
  };

  const closeAppDialog = useCallback(() => {
    setAppDialog(createDialogState());
  }, []);

  const confirmAppDialog = useCallback(async () => {
    if (typeof appDialog.onConfirm !== 'function') {
      closeAppDialog();
      return;
    }

    await appDialog.onConfirm();
  }, [appDialog, closeAppDialog]);

  const openSectionItemsModal = async (location) => {
    setSectionItemsModal({
      isOpen: true,
      loading: true,
      location,
      items: [],
      error: ''
    });

    try {
      const response = await fetch(`${API_BASE}/api/aisles/sections/${location.id}/items`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to load section items.');
      }

      setSectionItemsModal({
        isOpen: true,
        loading: false,
        location: payload.location || location,
        items: payload.items || [],
        error: ''
      });
    } catch (err) {
      console.error('Open section items error:', err);
      setSectionItemsModal({
        isOpen: true,
        loading: false,
        location,
        items: [],
        error: err.message || 'Failed to load section items.'
      });
    }
  };

  const closeSectionItemsModal = () => {
    setSectionItemsModal({
      isOpen: false,
      loading: false,
      location: null,
      items: [],
      error: ''
    });
  };

  // Pick path management functions
  const addPickPath = () => {
    const takenCommodities = new Set(pickPaths.map(p => p.commodity));
    const available = TEMPERATURE_OPTIONS.find(c => !takenCommodities.has(c));
    if (!available) {
      setAppDialog({
        isOpen: true,
        title: "Can't Add New Pick Path",
        message: 'All four temperature-type paths already exist. Delete one before adding another.',
        confirmLabel: 'OK',
        cancelLabel: '',
        confirmVariant: 'primary',
        closeOnBackdrop: true,
        onConfirm: () => closeAppDialog()
      });
      return;
    }
    setAddCommodity(available);
    setAddAisleOrder([]);
    setShowAddPathModal(true);
  };

  const editPickPath = () => {
    if (pickPaths.length === 0) {
      alert('No pick paths exist yet. Add one first.');
      return;
    }
    const first = pickPaths[0];
    setEditingPathId(first.id);
    setEditAisleOrder(pathToAisleIds(first));
    setShowEditPathModal(true);
  };

  const deletePickPath = () => {
    if (pickPaths.length === 0) {
      alert('No pick paths exist yet.');
      return;
    }
    setDeletingPathId(pickPaths[0].id);
    setDeleteConfirm(false);
    setShowDeletePathModal(true);
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= width; i += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // Build location ID to aisle ID mapping
    const locationToAisleId = {};
    aisles.forEach(aisle => {
      if (aisle.locations && Array.isArray(aisle.locations)) {
        aisle.locations.forEach(location => {
          locationToAisleId[location.id] = aisle.id;
        });
      }
    });

    // Draw pick paths with commodity-specific colors
    pickPaths.forEach(path => {
      const color = COMMODITY_COLORS[path.commodity] || '#999';
      const orderedAisleIds = [];
      const seen = new Set();
      (path.pathSequence || []).forEach(locId => {
        const aisleId = locationToAisleId[locId];
        if (aisleId != null && !seen.has(aisleId)) { seen.add(aisleId); orderedAisleIds.push(aisleId); }
      });
      if (orderedAisleIds.length < 1) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      let isFirst = true;
      orderedAisleIds.forEach(aisleId => {
        const aisle = aisles.find(a => a.id === aisleId);
        if (!aisle) return;
        const coords = getAisleCoordinates(aisle);
        const cx = coords.x * GRID_SIZE + GRID_SIZE / 2;
        const cy = coords.y * GRID_SIZE + GRID_SIZE / 2;
        if (isFirst) { ctx.moveTo(cx, cy); isFirst = false; } else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
    });

    // Draw aisles
    aisles.forEach((aisle, index) => {
      const coords = getAisleCoordinates(aisle);
      const x = coords.x * GRID_SIZE;
      const y = coords.y * GRID_SIZE;
      const size = GRID_SIZE;
      const aisleLabel = String(aisle?.aisleNumber || '');
      const maxLabelWidth = size - 4;
      let labelFontSize = Math.min(30, Math.max(20, Math.floor(size * 0.75)));

      // Draw box
      if (aisle.id === draggingId) {
        ctx.fillStyle = '#4CAF50';
      } else {
        ctx.fillStyle = '#2196F3';
      }
      ctx.fillRect(x, y, size, size);

      // Draw border
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, size, size);

      // Draw aisle number
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      while (labelFontSize > 14) {
        ctx.font = `900 ${labelFontSize}px Arial`;
        if (ctx.measureText(aisleLabel).width <= maxLabelWidth) {
          break;
        }
        labelFontSize -= 1;
      }

      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.strokeText(aisleLabel, x + size / 2, y + size / 2 + 0.5);
      ctx.fillText(aisleLabel, x + size / 2, y + size / 2);
    });
  }, [aisles, draggingId, pickPaths]);

  // Redraw canvas when aisles change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const saveChanges = async () => {
    try {
      // Only send real (numeric) IDs — never pass temp string IDs to the backend.
      const aisleUpdates = aisles
        .filter(a => typeof a.id === 'number')
        .map(aisle => ({ id: aisle.id, coordinates: aisle.coordinates }));

      const parseError = async res => {
        const errData = await res.json().catch(() => null);
        if (errData && errData.message) {
          return errData.message;
        }
        return `Failed to save changes (HTTP ${res.status})`;
      };

      const saveBatch = async method => {
        const response = await fetch(`${API_BASE}/api/aisles/batch/update`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aisles: aisleUpdates })
        });
        if (!response.ok) {
          throw new Error(await parseError(response));
        }
      };

      try {
        await saveBatch('POST');
      } catch (postError) {
        // Compatibility fallback for backends wired to PUT or without batch support.
        try {
          await saveBatch('PUT');
        } catch (putError) {
          const individualErrors = [];
          for (const update of aisleUpdates) {
            const singleRes = await fetch(`${API_BASE}/api/aisles/${update.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ coordinates: update.coordinates })
            });
            if (!singleRes.ok) {
              const singleErr = await parseError(singleRes);
              individualErrors.push(`Aisle ${update.id}: ${singleErr}`);
            }
          }

          if (individualErrors.length > 0) {
            throw new Error(individualErrors[0]);
          }
        }
      }

      setOriginalAisles(JSON.parse(JSON.stringify(aisles)));
      setHasChanges(false);
      setAppDialog({
        isOpen: true,
        title: 'Layout Saved',
        message: 'Map layout changes were saved successfully.',
        confirmLabel: 'OK',
        cancelLabel: '',
        confirmVariant: 'primary',
        closeOnBackdrop: true,
        onConfirm: () => closeAppDialog()
      });
    } catch (err) {
      console.error('Save error:', err);
      setAppDialog({
        isOpen: true,
        title: 'Save Failed',
        message: err.message || 'Failed to save map changes.',
        confirmLabel: 'OK',
        cancelLabel: '',
        confirmVariant: 'secondary',
        closeOnBackdrop: true,
        onConfirm: () => closeAppDialog()
      });
    }
  };

  const revertChanges = () => {
    setAppDialog({
      isOpen: true,
      title: 'Revert Changes',
      message: 'Are you sure you want to revert all unsaved map changes?',
      confirmLabel: 'Revert',
      cancelLabel: 'Cancel',
      confirmVariant: 'secondary',
      closeOnBackdrop: true,
      onConfirm: () => {
        setAisles(JSON.parse(JSON.stringify(originalAisles)));
        setHasChanges(false);
        closeAppDialog();
      }
    });
  };

  useEffect(() => {
    setAddAisleOrder((previous) => previous.filter((aisleId) => hasEligibleSectionForCommodity(aisles.find((aisle) => aisle.id === aisleId), addCommodity)));
  }, [addCommodity, aisles, hasEligibleSectionForCommodity]);

  useEffect(() => {
    if (!editingPath) {
      return;
    }

    setEditAisleOrder((previous) => previous.filter((aisleId) => hasEligibleSectionForCommodity(aisles.find((aisle) => aisle.id === aisleId), editingPath.commodity)));
  }, [aisles, editingPath, hasEligibleSectionForCommodity]);

  return (
    <div className={`map-screen ${isAdmin ? 'map-screen-admin' : 'map-screen-employee'}`}>
      <TopBar
        title="Store Map"
        leftActionLabel="<"
        leftActionAriaLabel="Back to inventory"
        onLeftAction={() => navigate('/inventory')}
      />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1>Store Layout & Path</h1>
        </div>

        <div className="map-toolbar">
          <div className="toolbar-info">
            <p>
              {mode === 'view' 
                ? 'View mode: Browse the store layout and pick paths.' 
                : 'Editing mode: Drag aisles to rearrange them and use Edit Aisles to manage sections, temperatures, and item placement.'
              }
            </p>
          </div>
        </div>

        {loading && <p>Loading aisles…</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}

        {!loading && !error && (
          <canvas
            ref={canvasRef}
            className="map-canvas"
            width={800}
            height={600}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerLeave}
            style={{ 
              touchAction: 'none',
              cursor: draggingId 
                ? 'grabbing' 
                : (hoveredAisleId && mode === 'editing') 
                  ? 'grab' 
                  : 'default' 
            }}
          />
        )}

        <div className="map-legend">
          <p>
            <span className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#2196F3' }} />
              Aisle
            </span>
            {mode === 'editing' && (
              <span className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#4CAF50' }} />
                Dragging
              </span>
            )}
            {Object.entries(COMMODITY_COLORS).map(([commodity, color]) =>
              pickPaths.some(p => p.commodity === commodity) ? (
                <span key={commodity} className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: color }} />
                  {COMMODITY_LABELS[commodity]} Path
                </span>
              ) : null
            )}
          </p>
        </div>
      </div>

      {/* Bottom action bar above navbar */}
      {isAdmin ? (
        <div className="map-action-bar">
          <>
            <div className="action-section">
              <button
                className={`btn ${mode === 'view' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMode(mode === 'view' ? 'editing' : 'view')}
              >
                {mode === 'view' ? 'Switch to Editing' : 'Switch to View'}
              </button>
            </div>

            {mode === 'editing' ? (
              <>
                <div className="action-section action-section-aisles">
                  <span className="action-label">Aisles:</span>
                  <button className="btn btn-success" onClick={addAisle} disabled={aisleEditorBusy}>
                    Add Aisle
                  </button>
                  <button className="btn btn-info" onClick={() => setShowAisleEditorModal(true)}>
                    Edit Aisles
                  </button>
                </div>

                <div className="action-section action-section-paths">
                  <span className="action-label">Pick Paths:</span>
                  <button className="btn btn-success" onClick={addPickPath}>
                    Add Path
                  </button>
                  <button className="btn btn-info" onClick={editPickPath}>
                    Edit Path
                  </button>
                  <button className="btn btn-secondary" onClick={deletePickPath}>
                    Delete Path
                  </button>
                </div>

                <div className="action-section action-section-save">
                  <button
                    className="btn btn-success"
                    onClick={saveChanges}
                    disabled={!hasChanges || loading}
                  >
                    Save Changes
                  </button>
                  <button
                    className="btn btn-warning"
                    onClick={revertChanges}
                    disabled={!hasChanges}
                  >
                    Revert Changes
                  </button>
                </div>
              </>
            ) : null}
          </>
        </div>
      ) : null}

      {/* Add Path Modal */}
      {showAddPathModal && (
        <div className="modal-backdrop" onClick={() => setShowAddPathModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Add Pick Path</h2>
            <div className="modal-field">
              <label>Temperature Type</label>
              <select value={addCommodity} onChange={e => setAddCommodity(e.target.value)}>
                {TEMPERATURE_OPTIONS
                  .filter(c => !pickPaths.some(p => p.commodity === c))
                  .map(c => <option key={c} value={c}>{COMMODITY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="path-editor">
              <div className="path-editor-col">
                <h4>Available Aisles</h4>
                {getAvailableAislesForCommodity(addCommodity, addAisleOrder).length === 0 ? (
                  <p className="path-empty">No aisles have {COMMODITY_LABELS[addCommodity].toLowerCase()} sections yet.</p>
                ) : getAvailableAislesForCommodity(addCommodity, addAisleOrder).map(aisle => (
                    <div key={aisle.id} className="path-aisle-row">
                      <span>{formatAisleDescriptor(aisle)}</span>
                      <button className="btn btn-info btn-sm"
                        onClick={() => setAddAisleOrder(prev => [...prev, aisle.id])}>
                        Add →
                      </button>
                    </div>
                  ))}
              </div>
              <div className="path-editor-col">
                <h4>Path Order</h4>
                {addAisleOrder.length === 0 && <p className="path-empty">No aisles added yet.</p>}
                {addAisleOrder.map((aisleId, idx) => {
                  const aisle = aisles.find(a => a.id === aisleId);
                  if (!aisle) return null;
                  return (
                    <div key={aisleId} className="path-aisle-row">
                      <span>{idx + 1}. {formatAisleDescriptor(aisle)}</span>
                      <div className="path-aisle-actions">
                        <button disabled={idx === 0} onClick={() => setAddAisleOrder(prev => {
                          const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n;
                        })}>▲</button>
                        <button disabled={idx === addAisleOrder.length - 1} onClick={() => setAddAisleOrder(prev => {
                          const n = [...prev]; [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; return n;
                        })}>▼</button>
                        <button onClick={() => setAddAisleOrder(prev => prev.filter(id => id !== aisleId))}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                disabled={addAisleOrder.length === 0}
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_BASE}/api/pickpaths`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        storeId,
                        commodity: addCommodity,
                        pathName: `${COMMODITY_LABELS[addCommodity]} Path`,
                        pathSequence: aisleIdsToPathSequence(addAisleOrder, addCommodity),
                        userId: currentUserId || undefined
                      })
                    });
                    if (!res.ok) {
                      const e = await res.json().catch(() => ({}));
                      throw new Error(e.message || 'Failed to create path');
                    }
                    await fetchPickPaths();
                    setShowAddPathModal(false);
                  } catch (err) { alert(`Error: ${err.message}`); }
                }}
              >
                Create Path
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAddPathModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Path Modal */}
      {showEditPathModal && (
        <div className="modal-backdrop" onClick={() => setShowEditPathModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Edit Pick Path</h2>
            <div className="modal-field">
              <label>Select Path</label>
              <select
                value={editingPathId || ''}
                onChange={e => {
                  const id = Number(e.target.value);
                  setEditingPathId(id);
                  const path = pickPaths.find(p => p.id === id);
                  setEditAisleOrder(path ? pathToAisleIds(path) : []);
                }}
              >
                {pickPaths.map(p => (
                  <option key={p.id} value={p.id}>
                    {COMMODITY_LABELS[p.commodity] || p.commodity} — {p.pathName}
                  </option>
                ))}
              </select>
            </div>
            <div className="path-editor">
              <div className="path-editor-col">
                <h4>Available Aisles</h4>
                {editingPath && getAvailableAislesForCommodity(editingPath.commodity, editAisleOrder).length === 0 ? (
                  <p className="path-empty">No additional aisles have {COMMODITY_LABELS[editingPath.commodity].toLowerCase()} sections.</p>
                ) : editingPath ? getAvailableAislesForCommodity(editingPath.commodity, editAisleOrder).map(aisle => (
                    <div key={aisle.id} className="path-aisle-row">
                      <span>{formatAisleDescriptor(aisle)}</span>
                      <button className="btn btn-info btn-sm"
                        onClick={() => setEditAisleOrder(prev => [...prev, aisle.id])}>
                        Add →
                      </button>
                    </div>
                  )) : null}
              </div>
              <div className="path-editor-col">
                <h4>Path Order</h4>
                {editAisleOrder.length === 0 && <p className="path-empty">No aisles in path.</p>}
                {editAisleOrder.map((aisleId, idx) => {
                  const aisle = aisles.find(a => a.id === aisleId);
                  if (!aisle) return null;
                  return (
                    <div key={aisleId} className="path-aisle-row">
                      <span>{idx + 1}. {formatAisleDescriptor(aisle)}</span>
                      <div className="path-aisle-actions">
                        <button disabled={idx === 0} onClick={() => setEditAisleOrder(prev => {
                          const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n;
                        })}>▲</button>
                        <button disabled={idx === editAisleOrder.length - 1} onClick={() => setEditAisleOrder(prev => {
                          const n = [...prev]; [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; return n;
                        })}>▼</button>
                        <button onClick={() => setEditAisleOrder(prev => prev.filter(id => id !== aisleId))}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                disabled={editAisleOrder.length === 0 || !editingPathId}
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_BASE}/api/pickpaths/${editingPathId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ pathSequence: aisleIdsToPathSequence(editAisleOrder, editingPath?.commodity) })
                    });
                    if (!res.ok) {
                      const e = await res.json().catch(() => ({}));
                      throw new Error(e.message || 'Failed to update path');
                    }
                    await fetchPickPaths();
                    setShowEditPathModal(false);
                  } catch (err) { alert(`Error: ${err.message}`); }
                }}
              >
                Save Changes
              </button>
              <button className="btn btn-secondary" onClick={() => setShowEditPathModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Path Modal */}
      {showDeletePathModal && (
        <div className="modal-backdrop" onClick={() => { setShowDeletePathModal(false); setDeleteConfirm(false); }}>
          <div className="modal-content modal-small" onClick={e => e.stopPropagation()}>
            <h2>Delete Pick Path</h2>
            <div className="modal-field">
              <label>Select Path to Delete</label>
              <select
                value={deletingPathId || ''}
                onChange={e => { setDeletingPathId(Number(e.target.value)); setDeleteConfirm(false); }}
              >
                {pickPaths.map(p => (
                  <option key={p.id} value={p.id}>
                    {COMMODITY_LABELS[p.commodity] || p.commodity} — {p.pathName}
                  </option>
                ))}
              </select>
            </div>
            {!deleteConfirm ? (
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setDeleteConfirm(true)}>Delete</button>
                <button className="btn btn-info" onClick={() => setShowDeletePathModal(false)}>Cancel</button>
              </div>
            ) : (
              <>
                <p className="delete-confirm-text">Are you sure? This path will be permanently deleted.</p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={async () => {
                    try {
                      const res = await fetch(`${API_BASE}/api/pickpaths/${deletingPathId}`, { method: 'DELETE' });
                      if (!res.ok) {
                        const e = await res.json().catch(() => ({}));
                        throw new Error(e.message || 'Failed to delete');
                      }
                      await fetchPickPaths();
                      setShowDeletePathModal(false);
                      setDeleteConfirm(false);
                    } catch (err) { alert(`Error: ${err.message}`); }
                  }}>Yes, Delete</button>
                  <button className="btn btn-info" onClick={() => setDeleteConfirm(false)}>No, Keep It</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAisleEditorModal && (
        <div className="modal-backdrop" onClick={() => setShowAisleEditorModal(false)}>
          <div className="modal-content aisle-editor-modal" onClick={e => e.stopPropagation()}>
            <div className="aisle-editor-header">
              <h2>Edit Aisles and Locations</h2>
              <p>
                Modify and delete aisles and their sections here.
                <br />
                To modify aisle locations, use the map grid.
              </p>
            </div>

            <div className="aisle-editor-list">
              {aisles.map((aisle) => (
                <section key={aisle.id} className="aisle-editor-card">
                  <div className="aisle-editor-card__header">
                    <div className="aisle-editor-card__title-block">
                      <h3>Aisle {aisle.aisleNumber}</h3>
                      <label className="aisle-editor-description-field">
                        <span>Description</span>
                        <input
                          type="text"
                          value={aisle.aisleName || ''}
                          onChange={(event) => setAisleDescriptionDraft(aisle.id, event.target.value)}
                          onBlur={() => updateAisleDescription(aisle)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                          }}
                          placeholder="Blank"
                          disabled={aisleEditorBusy}
                        />
                      </label>
                    </div>
                    <div className="aisle-editor-card__actions">
                      <button
                        type="button"
                        className="aisle-editor-btn aisle-editor-btn--add"
                        onClick={() => addSectionToAisle(aisle.id)}
                        disabled={aisleEditorBusy}
                      >
                        Add Section
                      </button>
                      <button
                        type="button"
                        className="aisle-editor-btn aisle-editor-btn--delete"
                        onClick={() => deleteAisleById(aisle)}
                        disabled={aisleEditorBusy}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="aisle-editor-sections">
                    {sortLocationsBySection(aisle.locations || []).map((location) => (
                      <div key={location.id} className="aisle-editor-section-row">
                        <span className="aisle-editor-section-label">{formatSectionLabel(location.section)}</span>
                        <button
                          type="button"
                          className="aisle-editor-btn aisle-editor-btn--list"
                          onClick={() => openSectionItemsModal(location)}
                          disabled={aisleEditorBusy}
                        >
                          Item List
                        </button>
                        <select
                          className="aisle-editor-section-select"
                          value={normalizeTemperature(location.temperature)}
                          onChange={(event) => updateSectionTemperature(location.id, event.target.value)}
                          disabled={aisleEditorBusy}
                        >
                          {TEMPERATURE_OPTIONS.map((temperature) => (
                            <option key={temperature} value={temperature}>{COMMODITY_LABELS[temperature]}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="aisle-editor-btn aisle-editor-btn--delete"
                          onClick={() => deleteSection(location)}
                          disabled={aisleEditorBusy}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="aisle-editor-footer">
              <button type="button" className="aisle-editor-exit" onClick={() => setShowAisleEditorModal(false)}>
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {appDialog.isOpen && (
        <div className="modal-backdrop" onClick={() => { if (appDialog.closeOnBackdrop) closeAppDialog(); }}>
          <section className="map-inline-dialog" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h2>{appDialog.title}</h2>
            <p className="map-inline-dialog-message">{appDialog.message}</p>
            <div className="map-inline-dialog-actions">
              {appDialog.cancelLabel ? (
                <button className="map-inline-dialog-button" onClick={closeAppDialog} disabled={aisleEditorBusy}>
                  {appDialog.cancelLabel}
                </button>
              ) : null}
              <button
                className={`map-inline-dialog-button ${appDialog.confirmVariant === 'secondary' ? 'map-inline-dialog-button-secondary' : 'map-inline-dialog-button-primary'}`}
                onClick={confirmAppDialog}
                disabled={aisleEditorBusy}
              >
                {appDialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}

      {sectionItemsModal.isOpen && (
        <div className="modal-backdrop" onClick={closeSectionItemsModal}>
          <div className="modal-content section-items-modal" onClick={e => e.stopPropagation()}>
            <h2>
              {sectionItemsModal.location?.aisle?.aisleNumber ? `Aisle ${sectionItemsModal.location.aisle.aisleNumber} · ` : ''}
              {formatSectionLabel(sectionItemsModal.location?.section)}
            </h2>
            {sectionItemsModal.loading ? <p>Loading section items…</p> : null}
            {!sectionItemsModal.loading && sectionItemsModal.error ? <p className="section-items-error">{sectionItemsModal.error}</p> : null}
            {!sectionItemsModal.loading && !sectionItemsModal.error ? (
              sectionItemsModal.items.length === 0 ? (
                <p>No items are currently assigned to this section.</p>
              ) : (
                <div className="section-items-list">
                  {sectionItemsModal.items.map((item) => (
                    <div key={item.itemLocationId} className="section-items-row">
                      <span>{item.name}</span>
                      <strong>Qty {item.quantityOnHand}</strong>
                    </div>
                  ))}
                </div>
              )
            ) : null}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={closeSectionItemsModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  );
};

export default MapScreen;