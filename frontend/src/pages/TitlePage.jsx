import React from 'react';
import { useNavigate } from 'react-router-dom';
import grocerEWordmarkLogo from '../assets/CSC 530 Grocer-E wordmark logo.png';
import './TitlePage.css';

const TitlePage = () => {
    const navigate = useNavigate();

    return (
        <div className="title-page-container">
            <div className="title-page-panel">
                <div className="title-page-main">
                    <div className="title-page-hero">
                        <img
                            src={grocerEWordmarkLogo}
                            alt="Grocer-E wordmark"
                            className="title-page-logo"
                        />
                        <p className="title-page-tagline">
                            The Technology Solution for Grocery
                            <br />
                            E-Commerce Fulfillment
                        </p>
                    </div>

                    <div className="button-group">
                        <button onClick={() => navigate('/login')} className="btn-primary">
                            Log In
                        </button>
                        <button onClick={() => navigate('/signup')} className="btn-secondary">
                            Sign Up
                        </button>
                    </div>
                </div>

                <p className="title-page-version">v0.0.0</p>
            </div>
        </div>
    );
};

export default TitlePage;