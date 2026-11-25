import { analyticsDatabaseConfig, getAnalyticsDatabase } from '../footballAnalytics/database.js';
import { publicFootballReadConfig } from '../runtimeEnvironment.js';
import { readPublicSnapshot } from './store.js';
import { readTursoPublicSnapshot } from './tursoSnapshot.js';
import type { PublicSnapshot } from '../../src/types/publicFootball.js';

export function publicFootballDatabaseStatus() {
  const config = publicFootballReadConfig();
  return {
    provider: config.provider,
    configured: config.configured,
    message: config.message,
    neonConfigured: analyticsDatabaseConfig().configured,
    failover: 'disabled',
  };
}

export function createPublicSnapshotLoader(dependencies: {
  config: () => ReturnType<typeof publicFootballReadConfig>;
  neon: () => Promise<Parameters<typeof readPublicSnapshot>[0]>;
  turso: (config: ReturnType<typeof publicFootballReadConfig>) => Promise<PublicSnapshot>;
}) {
  return async (): Promise<PublicSnapshot> => {
    const config = dependencies.config();
    if (!config.configured) throw new Error(config.message || 'Javni izvor podataka nije konfigurisan.');
    if (config.provider === 'turso') return dependencies.turso(config);
    return readPublicSnapshot(await dependencies.neon());
  };
}

export const loadPublicSnapshot = createPublicSnapshotLoader({
  config: publicFootballReadConfig,
  neon: getAnalyticsDatabase,
  turso: () => readTursoPublicSnapshot(),
});
