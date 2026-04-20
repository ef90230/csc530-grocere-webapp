import React, { useMemo } from 'react';
import './StoreMapPreview.css';

const GRID_COLUMNS = 20;
const GRID_ROWS = 15;

const compareAisleNumbers = (left, right) => String(left || '').localeCompare(String(right || ''), undefined, { numeric: true, sensitivity: 'base' });

const normalizeAisles = (aisles = []) => {
  return [...aisles]
    .map((aisle, index) => ({
      ...aisle,
      coordinates: aisle?.coordinates || {
        x: index * 2,
        y: Math.floor(index / 5) * 2
      }
    }))
    .sort((left, right) => compareAisleNumbers(left?.aisleNumber, right?.aisleNumber));
};

const StoreMapPreview = ({
  aisles,
  highlightedAisleNumbers = [],
  title = 'Store Map',
  emptyMessage = 'Map unavailable for this store.',
  className = ''
}) => {
  const normalizedAisles = useMemo(() => normalizeAisles(aisles || []), [aisles]);
  const highlightedSet = useMemo(() => new Set(
    (highlightedAisleNumbers || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ), [highlightedAisleNumbers]);

  return (
    <div className={`store-map-preview ${className}`.trim()}>
      {title ? <div className="store-map-preview__title">{title}</div> : null}
      <div className="store-map-preview__canvas" aria-label={title || 'Store map'}>
        {normalizedAisles.length > 0 ? normalizedAisles.map((aisle) => {
          const aisleNumber = String(aisle?.aisleNumber || '').trim();
          const coordinates = aisle?.coordinates || { x: 0, y: 0 };
          const isHighlighted = highlightedSet.has(aisleNumber);

          return (
            <div
              key={aisle?.id || aisleNumber}
              className={`store-map-preview__aisle${isHighlighted ? ' store-map-preview__aisle--highlighted' : ''}`}
              style={{
                left: `${(Number(coordinates.x) || 0) * (100 / GRID_COLUMNS)}%`,
                top: `${(Number(coordinates.y) || 0) * (100 / GRID_ROWS)}%`,
                width: `${100 / GRID_COLUMNS}%`,
                height: `${100 / GRID_ROWS}%`
              }}
            >
              {aisleNumber || '—'}
            </div>
          );
        }) : (
          <div className="store-map-preview__empty">{emptyMessage}</div>
        )}
      </div>
    </div>
  );
};

export default StoreMapPreview;