import { User, MembershipStatus, GlobalStats, VipPackage } from '../types';

export const DEMO_USERS: User[] = [
  {
    id: 'u1',
    email: 'admin@elitetips.com',
    emailVerified: true,
    membershipStatus: MembershipStatus.APPROVED,
    isAdmin: true,
    registeredAt: '2026-01-01',
    displayName: 'Admin'
  },
  {
    id: 'u2',
    email: 'user@example.com',
    emailVerified: true,
    membershipStatus: MembershipStatus.APPROVED,
    isAdmin: false,
    registeredAt: '2026-02-15',
    membershipExpDate: '2026-06-15',
    displayName: 'Premium John'
  },
  {
    id: 'u3',
    email: 'pending@example.com',
    emailVerified: true,
    membershipStatus: MembershipStatus.PENDING,
    isAdmin: false,
    registeredAt: '2026-05-10',
    displayName: 'Waitlist Will'
  },
  {
    id: 'u4',
    email: 'unverified@example.com',
    emailVerified: false,
    membershipStatus: MembershipStatus.PENDING,
    isAdmin: false,
    registeredAt: '2026-05-12',
    displayName: 'Ghost Guest'
  }
];

export const getDemoStats = (): GlobalStats => ({
  totalTips: 0,
  winCount: 0,
  lossCount: 0,
  successRate: 0,
  monthlyProfit: 0,
  roi: 0,
  winStreak: 0,
  loseStreak: 0
});

export const VIP_PACKAGES: VipPackage[] = [
  {
    id: 'p1',
    name: 'SILVER 7 DANA',
    price: 15,
    durationDays: 7,
    features: ['7 dana VIP tipova', 'Viber/Telegram grupa', 'Osnovne analize'],
    isPopular: false
  },
  {
    id: 'p2',
    name: 'GOLD 30 DANA',
    price: 40,
    durationDays: 30,
    features: ['30 dana VIP tipova', 'Prioritetna podrska', 'Detaljne analize', 'Live tipovi'],
    isPopular: true
  },
  {
    id: 'p3',
    name: 'ELITE 90 DANA',
    price: 100,
    durationDays: 90,
    features: ['90 dana VIP tipova', 'Sve iz GOLD paketa', 'Direktne konsultacije', 'Popust na obnovu'],
    isPopular: false
  }
];
