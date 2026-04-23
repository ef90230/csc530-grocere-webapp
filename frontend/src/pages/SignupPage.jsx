import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import SignupForm from '../components/auth/SignupForm';
import './SignupPage.css';

const SignupPage = () => {
    const [error, setError] = useState('');
    const { register: registerUser } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (formData) => {
        setError('');
        try {
            await registerUser(formData);
            if (formData.userType === 'employee' || formData.userType === 'admin') {
                navigate('/home');
            } else {
                navigate('/storefront');
            }
        } catch (err) {
            if (err.errors && Array.isArray(err.errors)) {
                const errorMessages = err.errors.map((e) => e.msg || e.message).join(', ');
                setError(`Validation failed: ${errorMessages}`);
            } else {
                setError(err.message || 'Registration failed');
            }
        }
    };

    return (
        <div className="signup-page-container">
            <div className="signup-page-panel">
                <div className="signup-page-topbar">
                    <button
                        type="button"
                        className="signup-page-back-button"
                        aria-label="Back to title page"
                        onClick={() => navigate('/')}
                    >
                        <span aria-hidden="true">&#9664;</span>
                    </button>
                    <h2 className="signup-page-title">Sign Up</h2>
                </div>
                <div className="signup-page-topbar-spacer" />

                <div className="signup-page-main">
                    <div className="signup-page-form-wrap">
                        <SignupForm onSubmit={handleSubmit} />
                    </div>
                </div>

                {error && <div className="signup-page-error-box">{error}</div>}
                <p className="signup-page-version">v0.0.0</p>
            </div>
        </div>
    );
};

export default SignupPage;
