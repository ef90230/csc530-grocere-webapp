import React from 'react';
import './PopupMenu.css';

const PopupMenu = ({
  isClosing,
  onClose,
  onBackroomLocations,
  onInventory,
  onStoreMap,
  onParkingLot,
  onMyStats,
  onStoreSettings,
  onLogout,
  showBackroomLocations = false,
  showParkingLot = false,
  showStoreSettings = false
}) => {
  return (
    <div className="popup-menu-overlay" onClick={onClose}>
      <aside
        className={`popup-menu-panel ${isClosing ? 'closing' : 'open'}`}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          className="popup-close-button"
          aria-label="Close menu"
          onClick={onClose}
        >
          ×
        </button>
        {showBackroomLocations ? (
          <button
            type="button"
            className="popup-action-button"
            onClick={onBackroomLocations}
          >
            Backroom Locations
          </button>
        ) : null}
        <button
          type="button"
          className="popup-action-button"
          onClick={onInventory}
        >
          Inventory
        </button>
        <button
          type="button"
          className="popup-action-button"
          onClick={onStoreMap}
        >
          Store Map
        </button>
        {showParkingLot ? (
          <button
            type="button"
            className="popup-action-button"
            onClick={onParkingLot}
          >
            Parking Lot
          </button>
        ) : null}
        <button
          type="button"
          className="popup-action-button"
          onClick={onMyStats}
        >
          My Stats
        </button>
        {showStoreSettings ? (
          <button
            type="button"
            className="popup-action-button"
            onClick={onStoreSettings}
          >
            Store Settings
          </button>
        ) : null}
        <button
          type="button"
          className="popup-action-button popup-logout-button"
          onClick={onLogout}
        >
          Log Out
        </button>
      </aside>
    </div>
  );
};

export default PopupMenu;
