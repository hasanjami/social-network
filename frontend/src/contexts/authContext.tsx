

"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { checkAuth, login as apiLogin, logout as apiLogout, signup as apiSignup, User } from '@/app/lib/api/auth';
import { getUserProfile } from '@/app/lib/api/user';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (emailOrUsername: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  signup: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
  checkAuth: () => Promise<void>;
  updateUser: (updatedData: Partial<User>) => void;  // Add this
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // Initialize auth state on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { isLoggedIn, user: currentUser } = await checkAuth();
        
        if (isLoggedIn && currentUser) {
          // For own profile, fetch using the username which will include stats
          try {
            const profile = await getUserProfile(currentUser.username);
            
            if (profile && profile.user) {
              setUser(profile.user);
            } else {
              setUser(currentUser);
            }
          } catch (error) {
            console.error('Error fetching profile during init:', error);
            setUser(currentUser);
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Add this new method
  const updateUser = (updatedData: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updatedData } : null);
  };

  const login = async (emailOrUsername: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await apiLogin(emailOrUsername, password);
      
      if (result.success && result.user) {
        // Fetch full profile with follower/following counts
        try {
          const profile = await getUserProfile(result.user.username);
          if (profile && profile.user) {
            setUser(profile.user);
          } else {
            setUser(result.user);
          }
        } catch (error) {
          console.error('Error fetching profile after login:', error);
          setUser(result.user);
        }
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await apiLogout();
      setUser(null);
      // Redirect to login page after logout
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (formData: FormData) => {
    setIsLoading(true);
    try {
      const result = await apiSignup(formData);
      
      if (result.success && result.user) {
        setUser(result.user);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    } finally {
      setIsLoading(false);
    }
  };

  const checkAuthStatus = async () => {
    setIsLoading(true);
    try {
      const { isLoggedIn, user: currentUser } = await checkAuth();
      if (isLoggedIn && currentUser) {
        try {
          const profile = await getUserProfile(currentUser.username);
          if (profile && profile.user) {
            setUser(profile.user);
          } else {
            setUser(currentUser);
          }
        } catch {
          setUser(currentUser);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Check auth error:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    signup,
    checkAuth: checkAuthStatus,
    updateUser,  // Add this
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};