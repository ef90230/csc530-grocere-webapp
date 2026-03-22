import React from 'react';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';

const PickingPage = () => {
    return (
        <div className="picking-page">
            <TopBar />
            <div className="page-content">
                {/* Picking content will go here */}
            </div>
            <Navbar />
        </div>
    );
};

export default PickingPage;