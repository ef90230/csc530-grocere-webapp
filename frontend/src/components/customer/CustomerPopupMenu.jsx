import React from 'react';
import './CustomerPopupMenu.css';

const CustomerPopupMenu = ({ isClosing, onClose, onLogout }) => {
  return (
    <div className="customer-popup-overlay" onClick={onClose}>
      <aside
        className={`customer-popup-panel ${isClosing ? 'closing' : 'open'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="customer-popup-close"
          aria-label="Close menu"
          onClick={onClose}
        >
          ×
        </button>
        <button
          type="button"
          className="customer-popup-logout"
          onClick={onLogout}
        >
          Log Out
        </button>
      </aside>
    </div>
  );
};

export default CustomerPopupMenu;
