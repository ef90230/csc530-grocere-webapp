import React from 'react';
import { useNavigate } from 'react-router-dom';
import './TitlePage.css';

const TitlePage = () => {
    const navigate = useNavigate();

    return (
        <div className="title-page-container">
            <h1 className="title-text">Grocer-E</h1>
            <div className="button-group">
                <button onClick={() => navigate('/login')} className="btn-primary">
                    Sign In
                </button>
                <button onClick={() => navigate('/signup')} className="btn-secondary">
                    Sign Up
                </button>
            </div>
        </div>
    );
};

export default TitlePage;