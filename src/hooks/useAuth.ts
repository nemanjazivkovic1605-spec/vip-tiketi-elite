import { useCallback, useEffect, useState } from 'react';
import { MembershipStatus, type User } from '../types';
import { authService, type RegisterPayload } from '../services/authService';

const hasVerifiedEmail = (user: User | null) => {
  if (!user) return false;
  return user.isAdmin || user.emailVerified === true;
};

const hasActiveVip = (user: User | null) => {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (!hasVerifiedEmail(user)) return false;
  if (user.accountStatus === 'blocked' || user.status === 'blocked') return false;
  if (user.vipApproved !== true || user.vipAccess !== true || user.membershipStatus !== MembershipStatus.APPROVED) return false;
  const expiry = user.vipExpiresAt || user.vip_expires_at;
  if (!expiry) return false;

  return new Date(expiry).getTime() > Date.now();
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

  const resendVerificationEmail = useCallback(async () => {
    await authService.resendVerificationEmail();
  }, []);

  const refreshUser = useCallback(async () => {
    const refreshedUser = await authService.refreshCurrentUser();
    setUser(refreshedUser);
    return refreshedUser;
  }, []);

  const isApproved = hasActiveVip(user);
  const isVerified = hasVerifiedEmail(user);
  const canAccessVip = hasActiveVip(user);
  const canAccessFree = Boolean(user && isVerified && user.accountStatus !== 'blocked' && user.status !== 'blocked');
  const isAdmin = user?.isAdmin === true;

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
