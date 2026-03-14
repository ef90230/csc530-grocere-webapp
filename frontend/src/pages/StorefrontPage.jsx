import React from 'react';
import Navbar from '../components/common/Navbar';

const StorefrontPage = () => {
  return (
    <div className="storefront-page">
      <div className="page-content">
        <h1>Welcome to Grocer-E Storefront</h1>
        <p>This is a placeholder for the customer storefront where users can browse and shop for groceries.</p>
        <p>Features to be implemented:</p>
        <ul>
          <li>Browse products by category</li>
          <li>Add items to cart</li>
          <li>Checkout process</li>
          <li>Order history</li>
        </ul>
      </div>
      <Navbar />
    </div>
  );
};

export default StorefrontPage;