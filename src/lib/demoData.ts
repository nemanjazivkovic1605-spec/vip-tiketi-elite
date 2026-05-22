import { GlobalStats, VipPackage } from '../types';

export const getDemoStats = (): GlobalStats => ({
  totalTips: 0,
  winCount: 0,
  lossCount: 0,
  refundCount: 0,
  completedCount: 0,
  successRate: 0,
  hitRate: 0,
  monthlyProfit: 0,
  unitsProfit: 0,
  totalUnitsStaked: 0,
  averageOdds: 0,
  yield: 0,
  roi: 0,
  winStreak: 0,
  loseStreak: 0,
  monthlyBreakdown: []
});

export const VIP_PACKAGES: VipPackage[] = [
  {
    id: 'free',
    name: 'FREE',
    price: 0,
    durationDays: 0,
    features: ['Besplatan nalog', 'FREE tiketi posle registracije', 'Zaključani VIP tipovi'],
    isPopular: false
  },
  {
    id: 'silver_7',
    name: 'SILVER 7 DANA',
    price: 15,
    durationDays: 7,
    features: ['7 dana VIP tipova', 'Viber/Telegram grupa', 'Osnovne analize'],
    isPopular: false
  },
  {
    id: 'gold_30',
    name: 'GOLD 30 DANA',
    price: 40,
    durationDays: 30,
    features: ['30 dana VIP tipova', 'Prioritetna podrska', 'Detaljne analize', 'Live tipovi'],
    isPopular: true
  },
  {
    id: 'elite_90',
    name: 'ELITE 90 DANA',
    price: 100,
    durationDays: 90,
    features: ['90 dana VIP tipova', 'Sve iz GOLD paketa', 'Direktne konsultacije', 'Popust na obnovu'],
    isPopular: false
  }
];
