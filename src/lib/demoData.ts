import { Tip, TicketStatus, User, MembershipStatus, GlobalStats, VipPackage } from '../types';

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

export const DEMO_TIPS: Tip[] = [
  {
    id: 't1',
    date: '2026-05-15',
    isVip: true,
    status: TicketStatus.PENDING,
    totalOdds: 3.42,
    analysis: 'Real Madrid vs Man City je klasik. Očekujemo GG3+ jer oba tima igraju ultra ofanzivno.',
    matches: [
      {
        id: 'm1',
        teams: 'Real Madrid - Man City',
        homeTeam: 'Real Madrid',
        awayTeam: 'Man City',
        league: 'Champions League',
        prediction: 'GG3+',
        odds: 1.85,
        time: '21:00'
      },
      {
        id: 'm2',
        teams: 'Liverpool - Arsenal',
        homeTeam: 'Liverpool',
        awayTeam: 'Arsenal',
        league: 'Premier League',
        prediction: 'Over 2.5',
        odds: 1.85,
        time: '18:30'
      }
    ]
  },
  {
    id: 't2',
    date: '2026-05-14',
    isVip: true,
    status: TicketStatus.WON,
    totalOdds: 2.10,
    result: 'WON',
    analysis: 'Inter je apsolutni favorit protiv Milana u ovom trenutku. Odbrana Milana je u kanalu.',
    matches: [
      {
        id: 'm3',
        teams: 'Inter - Milan',
        homeTeam: 'Inter',
        awayTeam: 'Milan',
        league: 'Serie A',
        prediction: '1',
        odds: 2.10,
        time: '20:45',
        result: '2:0',
        status: TicketStatus.WON
      }
    ]
  },
  {
    id: 't3',
    date: '2026-05-13',
    isVip: false,
    status: TicketStatus.LOST,
    totalOdds: 1.92,
    result: 'LOST',
    analysis: 'Free tip za testiranje javnog prikaza i filtera.',
    matches: [
      {
        id: 'm4',
        teams: 'Barcelona - Valencia',
        homeTeam: 'Barcelona',
        awayTeam: 'Valencia',
        league: 'La Liga',
        prediction: '1',
        odds: 1.92,
        time: '19:00',
        result: '1:1',
        status: TicketStatus.LOST
      }
    ]
  },
  {
    id: 't4',
    date: '2026-05-12',
    isVip: true,
    status: TicketStatus.WON,
    totalOdds: 2.76,
    result: 'WON',
    analysis: 'Kombinovani VIP tiket za stabilniji ROI prikaz.',
    matches: [
      {
        id: 'm5',
        teams: 'PSG - Lyon',
        homeTeam: 'PSG',
        awayTeam: 'Lyon',
        league: 'Ligue 1',
        prediction: 'Over 2.5',
        odds: 1.72,
        time: '21:00',
        result: '3:1',
        status: TicketStatus.WON
      },
      {
        id: 'm6',
        teams: 'Ajax - PSV',
        homeTeam: 'Ajax',
        awayTeam: 'PSV',
        league: 'Eredivisie',
        prediction: 'GG',
        odds: 1.6,
        time: '18:45',
        result: '2:2',
        status: TicketStatus.WON
      }
    ]
  }
];

export const getDemoStats = (): GlobalStats => {
  const completed = DEMO_TIPS.filter(t => t.status !== TicketStatus.PENDING);
  const wins = completed.filter(t => t.status === TicketStatus.WON);
  return {
    totalTips: DEMO_TIPS.length,
    winCount: wins.length,
    lossCount: completed.length - wins.length,
    successRate: parseFloat(((wins.length / (completed.length || 1)) * 100).toFixed(1)),
    monthlyProfit: 1240,
    roi: 18.5,
    winStreak: 5,
    loseStreak: 2
  };
};

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
    features: ['30 dana VIP tipova', 'Prioritetna podrška', 'Detaljne analize', 'Live tipovi'],
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
