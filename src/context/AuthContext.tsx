import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatarUrl?: string | null;
  subscriptionTier?: 'free' | 'premium' | 'pro' | string;
  subscriptionStatus?: 'inactive' | 'active' | 'cancelled' | string;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string; resetToken?: string }>;
  resetPassword: (token: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

async function apiFetch(path: string, options?: RequestInit, timeoutMs = 10000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'include',
      signal: controller.signal,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      }
    });
  } catch (e: any) {
    clearTimeout(tid);
    if (e?.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }
  clearTimeout(tid);
  
  // If the response is 401, it means the session/JWT token is invalid
  // We should clear the user data and return an error
  if (res.status === 401) {
    // Try to access the AuthContext to log out the user
    // Since we can't directly access the context here, we'll just throw an error
    // that will be caught by the calling function
    throw new Error('Not authenticated');
  }
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
  }
  const data = await res.json().catch(() => ({}));
  return data;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Function to refresh user data from server
  const refreshUserData = useCallback(async () => {
    try {
      const data = await apiFetch('/api/auth/me');
      if (data && typeof data.user === 'object' && data.user !== null) {
        setUser(data.user);
        return data.user;
      } else {
        setUser(null);
        return null;
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      // If there's an error fetching user data, clear the user
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) setLoading(false); }, 12000);
    refreshUserData()
      .finally(() => { if (!cancelled) setLoading(false); clearTimeout(t); });
    return () => { cancelled = true; clearTimeout(t); };
  }, [refreshUserData]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    return data;
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const data = await apiFetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    setUser(data.user);
    return data;
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const data = await apiFetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Error during logout:', error);
      // Even if the API call fails, we still want to clear the user data
    } finally {
      setUser(null);
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    return apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, loginWithGoogle, logout, forgotPassword, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};