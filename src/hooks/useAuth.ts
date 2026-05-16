import { useState, useEffect } from 'react';
import { User, MembershipStatus } from '../types';
import { mockAuthService } from '../services/mockAuth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage on mount
    const currentUser = mockAuthService.getCurrentUser();
    setUser(currentUser);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const loggedUser = await mockAuthService.login(email, password);
      setUser(loggedUser);
      return loggedUser;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setLoading(true);
    try {
      const newUser = await mockAuthService.register(email, password);
      setUser(newUser);
      return newUser;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    mockAuthService.logout();
    setUser(null);
  };

  const isApproved = user?.membershipStatus === MembershipStatus.APPROVED;
  const isVerified = user?.emailVerified === true;
  const canAccessVip = user?.isAdmin || (isVerified && isApproved);
  const isAdmin = user?.isAdmin === true;

  return { 
    user, 
    loading, 
    isAdmin, 
    isApproved, 
    isVerified, 
    canAccessVip,
    login,
    register,
    logout
  };
}
