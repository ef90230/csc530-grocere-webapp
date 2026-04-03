import React from 'react';
import './CustomerPopupMenu.css';

const CustomerPopupMenu = ({ isClosing, onClose, onLogout, onNavigate }) => {
  const handleMyOrders = () => {
    if (onNavigate) {
      onNavigate('/order-summary');
    }
  };

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
        <div className="customer-popup-content">
          <button
            type="button"
            className="customer-popup-menu-item"
            onClick={handleMyOrders}
          >
            My Orders
          </button>
          <button
            type="button"
            className="customer-popup-logout"
            onClick={onLogout}
          >
            Log Out
          </button>
        </div>
      </aside>
    </div>
  );
};

export default CustomerPopupMenu;
