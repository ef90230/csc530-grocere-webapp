import React from 'react';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';

const CommoditySelectPage = () => {
    return (
        <div className="commodity-select-page">
            <TopBar />
            <div className="page-content">
                {/* Commodity select content will go here */}
            </div>
            <Navbar />
        </div>
    );
};

export default CommoditySelectPage;