import React from 'react';
import './PopupMenu.css';

const PopupMenu = ({ isClosing, onClose, onInventory, onStoreMap, onMyStats, onLogout }) => {
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
        <button
          type="button"
          className="popup-action-button"
          onClick={onMyStats}
        >
          My Stats
        </button>
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
