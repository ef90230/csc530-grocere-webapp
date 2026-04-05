import React from 'react';
import './ParkingSpaceDialog.css';

const ParkingSpaceDialog = ({
  title,
  subtitle,
  promptText,
  spaces,
  occupiedSpaceSet,
  selectedSpace,
  onSelectSpace,
  onClose,
  onConfirm,
  isSubmitting,
  confirmLabel = 'Set'
}) => {
  const occupiedSpaces = occupiedSpaceSet instanceof Set ? occupiedSpaceSet : new Set();

  return (
    <div className="parking-space-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="parking-space-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h2 className="parking-space-dialog-title">{title}</h2>
        {subtitle ? <p className="parking-space-dialog-subtitle">{subtitle}</p> : null}
        <p className="parking-space-dialog-prompt">{promptText}</p>

        <div className="parking-space-grid" role="list" aria-label="Parking spaces">
          {spaces.map((spaceNumber) => {
            const isSelected = Number(selectedSpace) === Number(spaceNumber);
            const isOccupied = occupiedSpaces.has(Number(spaceNumber));
            const buttonClassName = [
              'parking-space-grid-button',
              isOccupied ? 'parking-space-grid-button--occupied' : '',
              isSelected ? 'parking-space-grid-button--selected' : ''
            ].filter(Boolean).join(' ');

            return (
              <button
                key={spaceNumber}
                type="button"
                className={buttonClassName}
                onClick={() => onSelectSpace(spaceNumber)}
                aria-pressed={isSelected}
                aria-label={`Space ${spaceNumber}${isOccupied && !isSelected ? ', occupied' : ''}`}
              >
                {spaceNumber}
              </button>
            );
          })}
        </div>

        <div className="parking-space-dialog-actions">
          <button type="button" className="parking-space-dialog-btn parking-space-dialog-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="parking-space-dialog-btn parking-space-dialog-btn--primary"
            disabled={!selectedSpace || isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};

export default ParkingSpaceDialog;
