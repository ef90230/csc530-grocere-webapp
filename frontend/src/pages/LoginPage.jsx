import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';

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
        <div>
            <h2>Login</h2>
            {error && <div className="error">{error}</div>}
            <LoginForm onSubmit={handleSubmit} />
        </div>
    );
};

export default LoginPage;