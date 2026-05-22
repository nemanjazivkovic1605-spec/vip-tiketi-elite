import { useCallback, useEffect, useState } from 'react';
import { MembershipStatus, type User } from '../types';
import { authService, type RegisterPayload } from '../services/authService';

const hasActiveVip = (user: User | null) => {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (user.membershipStatus !== MembershipStatus.APPROVED || !user.vip_expires_at) return false;

  return new Date(user.vip_expires_at).getTime() > Date.now();
};

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

  const isApproved = hasActiveVip(user);
  const isVerified = user?.emailVerified === true;
  const canAccessVip = hasActiveVip(user);
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
    logout,
  };
}
