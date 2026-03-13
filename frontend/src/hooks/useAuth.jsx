// simple authentication hook for login/register operations
// in a real app this would interact with context and token storage

export const useAuth = () => {
  const login = async ({ email, password, userType }) => {
    const res = await fetch('/api/auth/login', {
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
        ? '/api/auth/registerEmployee'
        : '/api/auth/registerCustomer';

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Registration failed');
    }

    return res.json();
  };

  return { login, register };
};

export default useAuth;
