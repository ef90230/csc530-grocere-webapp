import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <div className="home-content">
        <h1>Employee Dashboard</h1>
        <div className="buttons-grid">
          <button
            className="action-button picking-btn"
            onClick={() => navigate('/commodityselect')}
          >
            Picking
          </button>
          <button
            className="action-button staging-btn"
            onClick={() => navigate('/staging')}
          >
            Staging
          </button>
          <button
            className="action-button orders-btn"
            onClick={() => navigate('/orders')}
          >
            Order Fulfillment
          </button>
          <button
            className="action-button inventory-btn"
            onClick={() => navigate('/inventory')}
          >
            Store Management
          </button>
        </div>
      </div>
      <Navbar />
    </div>
  );
};

export default HomePage;