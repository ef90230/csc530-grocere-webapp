import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';
import grocerEWordmarkLogo from '../assets/CSC 530 Grocer-E wordmark logo.png';
import './LoginPage.css';

const LoginPage = () => {
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleSubmit = async (data) => {
        setError('');
        try {
            await login(data);
            // Redirect based on user type
            if (data.userType === 'employee' || data.userType === 'admin') {
                navigate('/home');
            } else {
                navigate('/storefront');
            }
        } catch (err) {
            setError(err.message || 'Login failed');
        }
    };

    return (
        <div className="login-page-container">
            <div className="login-page-panel">
                <div className="login-page-topbar">
                    <button
                        type="button"
                        className="login-page-back-button"
                        aria-label="Back to title page"
                        onClick={() => navigate('/')}
                    >
                        <span aria-hidden="true">&#9664;</span>
                    </button>
                    <h2 className="login-page-title">Log In</h2>
                </div>
                <div className="login-page-topbar-spacer" />

                <div className="login-page-main">
                    <div className="login-page-logo-wrap">
                        <img
                            src={grocerEWordmarkLogo}
                            alt="Grocer-E wordmark"
                            className="login-page-logo"
                        />
                    </div>

                    <div className="login-page-form-wrap">
                        <LoginForm onSubmit={handleSubmit} />
                    </div>
                </div>

                {error && <div className="login-page-error-box">{error}</div>}
                <p className="login-page-version">v0.0.0</p>
            </div>
        </div>
    );
};

export default LoginPage;