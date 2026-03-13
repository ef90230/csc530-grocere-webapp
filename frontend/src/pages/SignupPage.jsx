import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import SignupForm from '../components/auth/SignupForm';

const SignupPage = () => {
    const [error, setError] = useState('');
    const { register: registerUser } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (formData) => {
        setError('');
        try {
            await registerUser(formData);
            // Redirect based on user type
            if (formData.userType === 'employee') {
                navigate('/home');
            } else {
                navigate('/cart');
            }
        } catch (err) {
            setError(err.message || 'Registration failed');
        }
    };

    return (
        <div>
            <h2>Sign Up</h2>
            {error && <div className="error">{error}</div>}
            <SignupForm onSubmit={handleSubmit} />
        </div>
    );
};

export default SignupPage;