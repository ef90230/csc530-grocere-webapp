import React, { useState, useEffect, useRef } from 'react';
import Navbar from '../components/common/Navbar';
import './MapScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const GRID_SIZE = 40; // pixels per grid cell
const DEFAULT_STORE_ID = 1; // TODO: get from auth context or URL param
const DEFAULT_USER_ID = 1; // TODO: get from auth context

const MapScreen = () => {
  const [aisles, setAisles] = useState([]);
  const [originalAisles, setOriginalAisles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  // AI Proposal state
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [aiProposal, setAiProposal] = useState(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [proposalError, setProposalError] = useState(null);
  const [proposalCommodity, setProposalCommodity] = useState('ambient');

  // Fetch aisles on mount
  useEffect(() => {
    fetchAisles();
  }, []);

  // Redraw canvas when aisles change
  useEffect(() => {
    drawCanvas()
    ;
  }, [aisles, draggingId, aiProposal]);

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
      setAisles(data.aisles || []);
      setOriginalAisles(JSON.parse(JSON.stringify(data.aisles)));
    } catch (err) {
      console.error('Fetch aisles error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getAisleCoordinates = aisle => {
    if (aisle.coordinates) {
      return aisle.coordinates;
    }
    // Default positioning if no coordinates
    return { x: Math.random() * 200, y: Math.random() * 200 };
  };

  const handleCanvasMouseDown = e => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on an aisle
    for (const aisle of aisles) {
      const coords = getAisleCoordinates(aisle);
      const px = coords.x * GRID_SIZE;
      const py = coords.y * GRID_SIZE;
      const size = 30;

      if (x >= px && x <= px + size && y >= py && y <= py + size) {
        setDraggingId(aisle.id);
        setDragOffset({
          x: x - px,
          y: y - py
        });
        return;
      }
    }
  };

  const handleCanvasMouseMove = e => {
    if (draggingId === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newX = Math.max(0, Math.floor((x - dragOffset.x) / GRID_SIZE));
    const newY = Math.max(0, Math.floor((y - dragOffset.y) / GRID_SIZE));

    setAisles(prev =>
      prev.map(aisle =>
        aisle.id === draggingId
          ? {
              ...aisle,
              coordinates: { x: newX, y: newY }
            }
          : aisle
      )
    );

    setHasChanges(true);
  };

  const handleCanvasMouseUp = () => {
    setDraggingId(null);
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

  const drawCanvas = () => {
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

    // Draw path connecting aisles in their current positions
    if (aisles.length > 1 && !aiProposal) {
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      const sortedByPosition = [...aisles].sort((a, b) => {
        const coordsA = getAisleCoordinates(a);
        const coordsB = getAisleCoordinates(b);
        if (coordsA.y !== coordsB.y) return coordsA.y - coordsB.y;
        return coordsA.x - coordsB.x;
      });

      ctx.beginPath();
      const first = sortedByPosition[0];
      const firstCoords = getAisleCoordinates(first);
      ctx.moveTo(firstCoords.x * GRID_SIZE + 15, firstCoords.y * GRID_SIZE + 15);

      for (let i = 1; i < sortedByPosition.length; i++) {
        const coords = getAisleCoordinates(sortedByPosition[i]);
        ctx.lineTo(coords.x * GRID_SIZE + 15, coords.y * GRID_SIZE + 15);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw aisles
    aisles.forEach((aisle, index) => {
      const coords = getAisleCoordinates(aisle);
      const x = coords.x * GRID_SIZE;
      const y = coords.y * GRID_SIZE;
      const size = 30;

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
  };

  const saveChanges = async () => {
    try {
      const aisleUpdates = aisles.map(aisle => ({
        id: aisle.id,
        coordinates: aisle.coordinates
      }));

      const res = await fetch(`${API_BASE}/api/aisles/batch/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aisles: aisleUpdates })
      });

      if (!res.ok) {
        throw new Error('Failed to save changes');
      }

      const data = await res.json();
      setOriginalAisles(JSON.parse(JSON.stringify(aisles)));
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
    <div className="map-screen">
      <div className="page-content">
        <h1>Store Layout & Path</h1>
        <div className="map-toolbar">
          <div className="toolbar-info">
            <p>Drag aisles to rearrange them. The dashed line shows the pickup path.</p>
          </div>
          <div className="toolbar-buttons">
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
              className="btn btn-info"
              onClick={generateAIProposal}
              disabled={generatingAI || loading}
            >
              {generatingAI ? 'Generating…' : 'Generate AI Proposal'}
            </button>
            <button
              className="btn btn-primary"
              onClick={saveChanges}
              disabled={!hasChanges || loading}
            >
              Save Layout
            </button>
            <button
              className="btn btn-secondary"
              onClick={revertChanges}
              disabled={!hasChanges}
            >
              Revert Changes
            </button>
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
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          />
        )}

        <div className="map-legend">
          <p>
            <span className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#2196F3' }} />
              Aisle
            </span>
            <span className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#4CAF50' }} />
              Dragging
            </span>
            {aiProposal && (
              <span className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#FF9800' }} />
                AI Proposed Path
              </span>
            )}
          </p>
        </div>
      </div>

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

      {proposalError && (
        <div className="error-banner">{proposalError}</div>
      )}

      <Navbar />
    </div>
  );
};

export default MapScreen;