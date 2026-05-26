import { useCallback, useEffect, useState } from 'react';
import { type User } from '../types';
import { authService, type RegisterPayload } from '../services/authService';
import { getUserAccess } from '../utils/accessControl';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = authService.onUserChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const loggedUser = await authService.login(email, password);
      setUser(loggedUser);
      return loggedUser;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    setLoading(true);
    try {
      const newUser = await authService.register(payload);
      setUser(newUser);
      return newUser;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    await authService.resendVerificationEmail();
  }, []);

  const refreshUser = useCallback(async () => {
    const refreshedUser = await authService.refreshCurrentUser();
    setUser(refreshedUser);
    return refreshedUser;
  }, []);

  const { isApproved, isVerified, canAccessVip, canAccessFree, isAdmin } = getUserAccess(user);

  return {
    user,
    loading,
    isAdmin,
    isApproved,
    isVerified,
    canAccessFree,
    canAccessVip,
    login,
    register,
    logout,
    resendVerificationEmail,
    refreshUser,
  };
}
