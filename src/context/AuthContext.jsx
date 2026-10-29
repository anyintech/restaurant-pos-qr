import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [activeStaff, setActiveStaff] = useState({
    admin: null,
    cashier: null,
    kitchen: null
  });

  const [loading, setLoading] = useState(true);

  // Check existing session tokens from sessionStorage
  useEffect(() => {
    async function verifySessions() {
      const roles = ['admin', 'cashier', 'kitchen'];
      const updated = {};

      for (const r of roles) {
        const token = sessionStorage.getItem(`${r}_auth_token`);
        if (token) {
          try {
            const res = await fetch(`/api/auth/verify?token=${token}`);
            if (res.ok) {
              const data = await res.json();
              if (data.valid && data.staff) {
                updated[r] = data.staff;
              }
            }
          } catch (e) {}
        }
      }

      setActiveStaff(prev => ({ ...prev, ...updated }));
      setLoading(false);
    }

    verifySessions();
  }, []);

  const login = useCallback(async (role, loginId, pin) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, loginId, pin })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem(`${role}_auth_token`, data.token);
        sessionStorage.setItem(`${role}_staff_info`, JSON.stringify(data.staff));
        setActiveStaff(prev => ({ ...prev, [role]: data.staff }));
        return { success: true, staff: data.staff };
      } else {
        return { success: false, error: data.error || 'Authentication failed' };
      }
    } catch (e) {
      return { success: false, error: 'Connection error' };
    }
  }, []);

  const logout = useCallback((role) => {
    sessionStorage.removeItem(`${role}_auth_token`);
    sessionStorage.removeItem(`${role}_staff_info`);
    setActiveStaff(prev => ({ ...prev, [role]: null }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        activeStaff,
        loading,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
