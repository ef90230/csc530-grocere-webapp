import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './DispensePage.css';

const DispensePage = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const orderNumber = location.state?.orderNumber;
    const customerName = location.state?.customerName;

    return (
        <div className="dispense-page">
            <TopBar
                title="Dispense"
                theme="green"
                leftActionLabel="<"
                leftActionAriaLabel="Back to orders"
                onLeftAction={() => navigate('/orders')}
            />

            <main className="dispense-content">
                <section className="dispense-placeholder-card">
                    <h1>Dispense flow coming soon</h1>
                    {orderNumber ? <p>Order: {orderNumber}</p> : null}
                    {customerName ? <p>Customer: {customerName}</p> : null}
                </section>
            </main>

            <Navbar />
        </div>
    );
};

export default DispensePage;
