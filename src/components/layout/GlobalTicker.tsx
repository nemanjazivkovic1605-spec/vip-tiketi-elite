import React, { useEffect, useState } from 'react';
import { TopNoticeBar } from '../home/HomeLandingComponents';
import { mockTipsService } from '../../services/mockTips';
import type { GlobalStats } from '../../types';

export default function GlobalTicker() {
  const [stats, setStats] = useState<GlobalStats | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setStats(await mockTipsService.getPublicStats());
      } catch (error) {
        console.error('Global ticker stats load failed:', error);
        setStats(null);
      }
    };

    void loadStats();
    return mockTipsService.subscribePublicStats(() => void loadStats());
  }, []);

  const hasPublicStats = Boolean(stats?.completedCount);

  return (
    <TopNoticeBar
      latestMonthProfitUnits={hasPublicStats ? stats?.monthlyBreakdown[0]?.profitUnits ?? null : null}
      roi={hasPublicStats ? stats?.roi ?? null : null}
      completedCount={hasPublicStats ? stats?.completedCount ?? null : null}
      hitRate={hasPublicStats ? stats?.hitRate ?? null : null}
    />
  );
}

