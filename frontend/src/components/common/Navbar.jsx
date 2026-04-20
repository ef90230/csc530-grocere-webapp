import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import homeButtonSymbol from '../../assets/home-buttons/home-button-symbol.png';
import pickingButtonSymbol from '../../assets/home-buttons/picking-button-symbol.png';
import stagingButtonSymbol from '../../assets/home-buttons/staging-button-symbol.png';
import ordersButtonSymbol from '../../assets/home-buttons/orders-button-symbol.png';
import './Navbar.css';

const NAV_ITEMS = [
  {
    path: '/home',
    label: 'Home',
    icon: homeButtonSymbol,
    iconAlt: 'Home symbol'
  },
  {
    path: '/commodityselect',
    label: 'Picking',
    icon: pickingButtonSymbol,
    iconAlt: 'Picking symbol'
  },
  {
    path: '/staging',
    label: 'Staging',
    icon: stagingButtonSymbol,
    iconAlt: 'Staging symbol'
  },
  {
    path: '/orders',
    label: 'Orders',
    icon: ordersButtonSymbol,
    iconAlt: 'Orders symbol'
  }
];

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/staging') {
      return location.pathname.startsWith('/staging');
    }

    return location.pathname === path;
  };

  return (
    <nav className="navbar">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.path}
          className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          <img className="nav-item-icon" src={item.icon} alt={item.iconAlt} />
          <span className="nav-item-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default Navbar;
