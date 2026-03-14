// simple authentication hook for login/register operations
// in a real app this would interact with context and token storage

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const useAuth = () => {
  const login = async ({ email, password, userType }) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, userType }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Login failed');
    }

    return res.json();
  };

  const register = async (formData) => {
    // choose endpoint based on userType
    const url =
      formData.userType === 'employee'
        ? `${API_BASE}/api/auth/register/employee`
        : `${API_BASE}/api/auth/register/customer`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const error = new Error(err.message || 'Registration failed');
      error.errors = err.errors;
      throw error;
    }

    return res.json();
  };

  return { login, register };
};

export default useAuth;
