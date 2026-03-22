import React from 'react';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';

const OrderListPage = () => {
    return (
        <div className="order-list-page">
            <TopBar />
            <div className="page-content">
                {/* Order list content will go here */}
            </div>
            <Navbar />
        </div>
    );
};

export default OrderListPage;