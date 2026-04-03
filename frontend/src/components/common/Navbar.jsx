import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <button
        className={`nav-item ${isActive('/home') ? 'active' : ''}`}
        onClick={() => navigate('/home')}
      >
        Home
      </button>
      <button
        className={`nav-item ${isActive('/commodityselect') ? 'active' : ''}`}
        onClick={() => navigate('/commodityselect')}
      >
        Picking
      </button>
      <button
        className={`nav-item ${isActive('/staging') ? 'active' : ''}`}
        onClick={() => navigate('/staging')}
      >
        Staging
      </button>
      <button
        className={`nav-item ${isActive('/orders') ? 'active' : ''}`}
        onClick={() => navigate('/orders')}
      >
        Orders
      </button>
    </nav>
  );
};

export default Navbar;
