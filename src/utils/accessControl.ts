import { MembershipStatus, type User } from '../types';

export const hasVerifiedEmailAccess = (user: User | null) => {
  if (!user) return false;
  return user.isAdmin || user.emailVerified === true;
};

export const hasActiveVipAccess = (user: User | null) => {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (!hasVerifiedEmailAccess(user)) return false;
  if (user.accountStatus === 'blocked' || user.status === 'blocked') return false;
  if (user.vipApproved !== true || user.vipAccess !== true || user.membershipStatus !== MembershipStatus.APPROVED) return false;
  const expiry = user.vipExpiresAt || user.vip_expires_at;
  if (!expiry) return false;

  return new Date(expiry).getTime() > Date.now();
};

export const getUserAccess = (user: User | null) => {
  const isAdmin = user?.isAdmin === true;
  const isVerified = hasVerifiedEmailAccess(user);
  const canAccessVip = hasActiveVipAccess(user);
  const canAccessFree = Boolean(user && isVerified && user.accountStatus !== 'blocked' && user.status !== 'blocked');

  return {
    isAdmin,
    isVerified,
    isApproved: canAccessVip,
    canAccessFree,
    canAccessVip,
  };
};
