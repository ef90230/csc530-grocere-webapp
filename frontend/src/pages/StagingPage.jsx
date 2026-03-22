import React from 'react';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';

const StagingPage = () => {
    return (
        <div className="staging-page">
            <TopBar />
            <div className="page-content">
                {/* Staging content will go here */}
            </div>
            <Navbar />
        </div>
    );
};

export default StagingPage;