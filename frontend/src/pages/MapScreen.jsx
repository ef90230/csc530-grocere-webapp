import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './MapScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const GRID_SIZE = 40; // pixels per grid cell

const COMMODITY_COLORS = {
  ambient: '#1a1a1a',
  chilled: '#87CEEB',
  frozen: '#1a5276',
  hot: '#FF6B35',
};
const COMMODITY_LABELS = { ambient: 'Ambient', chilled: 'Chilled', frozen: 'Frozen', hot: 'Hot' };

const DEFAULT_STORE_ID = 1; // TODO: get from auth context or URL param
const DEFAULT_USER_ID = 1; // TODO: get from auth context

const MapScreen = () => {
  const navigate = useNavigate();
  const userType = window.localStorage.getItem('userType');
  const isAdmin = userType === 'admin';
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

  // AI Proposal state
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [aiProposal, setAiProposal] = useState(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [proposalError, setProposalError] = useState(null);
  const [proposalCommodity, setProposalCommodity] = useState('ambient');

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

  // Fetch on mount
  useEffect(() => {
    fetchAisles();
    fetchPickPaths();
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

  const fetchAisles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/aisles/store/${DEFAULT_STORE_ID}`);
      if (!res.ok) {
        throw new Error('Failed to load aisles');
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Unexpected response');
      }
      
      // Ensure all aisles have coordinates
      const aislesWithCoords = (data.aisles || []).map((aisle, index) => ({
        ...aisle,
        coordinates: aisle.coordinates || { 
          x: index * 2, 
          y: Math.floor(index / 5) * 2 
        }
      }));
      
      setAisles(aislesWithCoords);
      setOriginalAisles(JSON.parse(JSON.stringify(aislesWithCoords)));
    } catch (err) {
      console.error('Fetch aisles error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPickPaths = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/pickpaths/store/${DEFAULT_STORE_ID}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setPickPaths(data.pickPaths || []);
    } catch (err) {
      console.error('Fetch pick paths error:', err);
    }
  };

  const buildLocationToAisleId = () => {
    const map = {};
    aisles.forEach(aisle => {
      if (aisle.locations && Array.isArray(aisle.locations)) {
        aisle.locations.forEach(loc => { map[loc.id] = aisle.id; });
      }
    });
    return map;
  };

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

  const aisleIdsToPathSequence = aisleIds => {
    const locationIds = [];
    aisleIds.forEach(aisleId => {
      const aisle = aisles.find(a => a.id === aisleId);
      if (aisle && aisle.locations) aisle.locations.forEach(loc => locationIds.push(loc.id));
    });
    return locationIds;
  };

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
  const addAisle = () => {
    const newAisleNumber = Math.max(...aisles.map(a => parseInt(a.aisleNumber) || 0), 0) + 1;
    const newAisle = {
      id: `temp-${Date.now()}`, // Temporary ID until saved
      aisleNumber: newAisleNumber.toString(),
      aisleName: `Aisle ${newAisleNumber}`,
      category: 'General',
      coordinates: { x: Math.floor(Math.random() * 10), y: Math.floor(Math.random() * 8) }
    };
    setAisles(prev => [...prev, newAisle]);
    setHasChanges(true);
  };

  const deleteAisle = () => {
    const aisleNumber = prompt('Enter aisle number to delete:');
    if (aisleNumber) {
      setAisles(prev => prev.filter(aisle => aisle.aisleNumber !== aisleNumber));
      setHasChanges(true);
    }
  };

  // Pick path management functions
  const addPickPath = () => {
    const takenCommodities = new Set(pickPaths.map(p => p.commodity));
    const available = ['ambient', 'chilled', 'frozen', 'hot'].find(c => !takenCommodities.has(c));
    if (!available) {
      alert('All four temperature-type paths already exist. Delete one before adding another.');
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

  const generateAIProposal = async () => {
    setGeneratingAI(true);
    setProposalError(null);
    try {
      const res = await fetch(`${API_BASE}/api/pickpaths/generate/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: DEFAULT_STORE_ID,
          commodity: proposalCommodity,
          userId: DEFAULT_USER_ID,
          savePath: false
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to generate AI proposal');
      }

      const data = await res.json();
      setAiProposal(data);
      setShowProposalModal(true);
    } catch (err) {
      console.error('AI proposal error:', err);
      setProposalError(err.message);
    } finally {
      setGeneratingAI(false);
    }
  };

  const approveProposal = async () => {
    if (!aiProposal) return;

    try {
      const res = await fetch(`${API_BASE}/api/pickpaths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: DEFAULT_STORE_ID,
          commodity: proposalCommodity,
          pathName: `AI Generated - ${proposalCommodity}`,
          pathSequence: aiProposal.suggestedPath
        })
      });

      if (!res.ok) {
        throw new Error('Failed to save path');
      }

      alert('Path approved and saved successfully!');
      setShowProposalModal(false);
      setAiProposal(null);
    } catch (err) {
      console.error('Approve proposal error:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const rejectProposal = () => {
    setShowProposalModal(false);
    setAiProposal(null);
  };

  const modifyProposal = () => {
    setShowProposalModal(false);
    // User can continue dragging aisles to manually adjust
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

    // Draw AI proposed path if available
    if (aiProposal && aiProposal.suggestedPath) {
      ctx.strokeStyle = '#FF9800';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);

      // Draw path through proposed locations (convert to aisles)
      ctx.beginPath();
      let firstPoint = true;
      for (let i = 0; i < aiProposal.suggestedPath.length; i++) {
        const locationId = aiProposal.suggestedPath[i];
        const aisleId = locationToAisleId[locationId];
        const aisle = aisles.find(a => a.id === aisleId);
        if (aisle) {
          const coords = getAisleCoordinates(aisle);
          const px = coords.x * GRID_SIZE + 15;
          const py = coords.y * GRID_SIZE + 15;

          if (firstPoint) {
            ctx.moveTo(px, py);
            firstPoint = false;
          } else {
            ctx.lineTo(px, py);
          }
        }
      }
      ctx.stroke();
    }

    // Draw pick paths with commodity-specific colors
    if (!aiProposal) {
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
    }

    // Draw aisles
    aisles.forEach((aisle, index) => {
      const coords = getAisleCoordinates(aisle);
      const x = coords.x * GRID_SIZE;
      const y = coords.y * GRID_SIZE;
      const size = GRID_SIZE;

      // Determine if this aisle is in the AI proposal
      const isInProposal = aiProposal && aiProposal.suggestedPath && 
        aisle.locations && Array.isArray(aisle.locations) &&
        aisle.locations.some(loc => aiProposal.suggestedPath.includes(loc.id));

      // Draw box
      if (aisle.id === draggingId) {
        ctx.fillStyle = '#4CAF50';
      } else if (isInProposal) {
        ctx.fillStyle = '#FF9800';
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
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(aisle.aisleNumber, x + size / 2, y + size / 2);
    });
  }, [aisles, draggingId, aiProposal, pickPaths]);

  // Redraw canvas when aisles change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const saveChanges = async () => {
    try {
      const newAisles = aisles.filter(aisle => typeof aisle.id === 'string' && aisle.id.startsWith('temp-'));

      let mergedAisles = [...aisles];

      if (newAisles.length > 0) {
        const createdAisles = await Promise.all(
          newAisles.map(async aisle => {
            const createRes = await fetch(`${API_BASE}/api/aisles`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                storeId: DEFAULT_STORE_ID,
                aisleNumber: aisle.aisleNumber,
                aisleName: aisle.aisleName,
                category: aisle.category,
                zone: aisle.zone || null,
                coordinates: aisle.coordinates
              })
            });

            if (!createRes.ok) {
              const createErr = await createRes.json().catch(() => ({}));
              throw new Error(createErr.message || 'Failed to create new aisle');
            }

            const createData = await createRes.json();
            return createData.aisle;
          })
        );

        const createdByAisleNumber = new Map(createdAisles.map(aisle => [aisle.aisleNumber, aisle]));
        mergedAisles = aisles.map(aisle => {
          if (typeof aisle.id === 'string' && aisle.id.startsWith('temp-')) {
            return createdByAisleNumber.get(aisle.aisleNumber) || aisle;
          }
          return aisle;
        });
      }

      // Only send real (numeric) IDs — never pass temp string IDs to the backend.
      const aisleUpdates = mergedAisles
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

      setAisles(mergedAisles);
      setOriginalAisles(JSON.parse(JSON.stringify(mergedAisles)));
      setHasChanges(false);
      alert('Layout saved successfully!');
    } catch (err) {
      console.error('Save error:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const revertChanges = () => {
    if (window.confirm('Are you sure you want to revert all changes?')) {
      setAisles(JSON.parse(JSON.stringify(originalAisles)));
      setHasChanges(false);
    }
  };

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
                : 'Editing mode: Drag aisles to rearrange them. The dashed line shows the pickup path.'
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
            {aiProposal && (
              <span className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#FF9800' }} />
                AI Proposed Path
              </span>
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
                <div className="action-section">
                  <span className="action-label">Aisles:</span>
                  <button className="btn btn-info" onClick={addAisle}>
                    Add Aisle
                  </button>
                  <button className="btn btn-secondary" onClick={deleteAisle}>
                    Delete Aisle
                  </button>
                </div>

                <div className="action-section">
                  <span className="action-label">Pick Paths:</span>
                  <button className="btn btn-info" onClick={addPickPath}>
                    Add Path
                  </button>
                  <button className="btn btn-info" onClick={editPickPath}>
                    Edit Path
                  </button>
                  <button className="btn btn-secondary" onClick={deletePickPath}>
                    Delete Path
                  </button>
                </div>

                <div className="action-section">
                  <select
                    value={proposalCommodity}
                    onChange={e => setProposalCommodity(e.target.value)}
                    className="commodity-select"
                  >
                    <option value="ambient">Ambient</option>
                    <option value="chilled">Chilled</option>
                    <option value="frozen">Frozen</option>
                    <option value="hot">Hot</option>
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={generateAIProposal}
                    disabled={generatingAI || loading}
                  >
                    {generatingAI ? 'Generating…' : 'AI Suggest Path'}
                  </button>
                </div>

                <div className="action-section">
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

      {/* AI Proposal Modal */}
      {showProposalModal && aiProposal && (
        <div className="modal-backdrop" onClick={rejectProposal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>AI Path Proposal</h2>
            <div className="proposal-details">
              <div className="proposal-section">
                <h3>Provider</h3>
                <p>{aiProposal.provider}</p>
              </div>

              {aiProposal.rationale && (
                <div className="proposal-section">
                  <h3>Rationale</h3>
                  <p>{aiProposal.rationale}</p>
                </div>
              )}

              {aiProposal.metrics && (
                <div className="proposal-section">
                  <h3>Efficiency Metrics</h3>
                  <ul>
                    {Object.entries(aiProposal.metrics).map(([key, value]) => (
                      <li key={key}>
                        <strong>{key}:</strong> {typeof value === 'number' ? value.toFixed(2) : value}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiProposal.weakPoints && aiProposal.weakPoints.length > 0 && (
                <div className="proposal-section">
                  <h3>Weak Points</h3>
                  <ul>
                    {aiProposal.weakPoints.map((point, idx) => (
                      <li key={idx}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiProposal.recommendations && aiProposal.recommendations.length > 0 && (
                <div className="proposal-section">
                  <h3>Recommendations</h3>
                  <ul>
                    {aiProposal.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiProposal.suggestedPath && (
                <div className="proposal-section">
                  <h3>Suggested Path Sequence</h3>
                  <p className="path-sequence">
                    {aiProposal.suggestedPath.join(' → ')}
                  </p>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={approveProposal}>
                Approve & Save
              </button>
              <button className="btn btn-info" onClick={modifyProposal}>
                Modify & Continue
              </button>
              <button className="btn btn-secondary" onClick={rejectProposal}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Path Modal */}
      {showAddPathModal && (
        <div className="modal-backdrop" onClick={() => setShowAddPathModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Add Pick Path</h2>
            <div className="modal-field">
              <label>Temperature Type</label>
              <select value={addCommodity} onChange={e => setAddCommodity(e.target.value)}>
                {['ambient', 'chilled', 'frozen', 'hot']
                  .filter(c => !pickPaths.some(p => p.commodity === c))
                  .map(c => <option key={c} value={c}>{COMMODITY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="path-editor">
              <div className="path-editor-col">
                <h4>Available Aisles</h4>
                {aisles
                  .filter(a => typeof a.id === 'number' && !addAisleOrder.includes(a.id))
                  .sort((a, b) => parseInt(a.aisleNumber) - parseInt(b.aisleNumber))
                  .map(aisle => (
                    <div key={aisle.id} className="path-aisle-row">
                      <span>{aisle.aisleNumber} — {aisle.aisleName}</span>
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
                      <span>{idx + 1}. {aisle.aisleNumber} — {aisle.aisleName}</span>
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
                        storeId: DEFAULT_STORE_ID,
                        commodity: addCommodity,
                        pathName: `${COMMODITY_LABELS[addCommodity]} Path`,
                        pathSequence: aisleIdsToPathSequence(addAisleOrder),
                        userId: DEFAULT_USER_ID
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
                {aisles
                  .filter(a => typeof a.id === 'number' && !editAisleOrder.includes(a.id))
                  .sort((a, b) => parseInt(a.aisleNumber) - parseInt(b.aisleNumber))
                  .map(aisle => (
                    <div key={aisle.id} className="path-aisle-row">
                      <span>{aisle.aisleNumber} — {aisle.aisleName}</span>
                      <button className="btn btn-info btn-sm"
                        onClick={() => setEditAisleOrder(prev => [...prev, aisle.id])}>
                        Add →
                      </button>
                    </div>
                  ))}
              </div>
              <div className="path-editor-col">
                <h4>Path Order</h4>
                {editAisleOrder.length === 0 && <p className="path-empty">No aisles in path.</p>}
                {editAisleOrder.map((aisleId, idx) => {
                  const aisle = aisles.find(a => a.id === aisleId);
                  if (!aisle) return null;
                  return (
                    <div key={aisleId} className="path-aisle-row">
                      <span>{idx + 1}. {aisle.aisleNumber} — {aisle.aisleName}</span>
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
                      body: JSON.stringify({ pathSequence: aisleIdsToPathSequence(editAisleOrder) })
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

      {proposalError && (
        <div className="error-banner">{proposalError}</div>
      )}

      <Navbar />
    </div>
  );
};

export default MapScreen;