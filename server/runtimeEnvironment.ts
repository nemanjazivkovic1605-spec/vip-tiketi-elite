export type ServerDeployment = 'development' | 'preview' | 'production';

export function getServerDeployment(env: NodeJS.ProcessEnv = process.env): ServerDeployment {
  if (env.VERCEL_ENV === 'production') return 'production';
  if (env.VERCEL_ENV === 'preview') return 'preview';
  return 'development';
}

export const isPreviewDeployment = (env?: NodeJS.ProcessEnv) => getServerDeployment(env) === 'preview';
export const isProductionDeployment = (env?: NodeJS.ProcessEnv) => getServerDeployment(env) === 'production';
export const hasFirestoreEmulator = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.FIRESTORE_EMULATOR_HOST?.trim());

export function canWriteFirebaseData(env: NodeJS.ProcessEnv = process.env): boolean {
  const deployment = getServerDeployment(env);
  return deployment === 'production' || deployment === 'development' && hasFirestoreEmulator(env);
}

export function canRunFirebaseAutomation(env: NodeJS.ProcessEnv = process.env): boolean {
  return canWriteFirebaseData(env);
}

export function analyticsDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const deployment = getServerDeployment(env);
  const value = deployment === 'production'
    ? env.ANALYTICS_DATABASE_URL
    : deployment === 'preview'
      ? env.PREVIEW_ANALYTICS_DATABASE_URL
      : env.LOCAL_ANALYTICS_DATABASE_URL;
  const selected = value?.trim();
  if (!selected) return undefined;
  if (deployment !== 'production' && selected === env.ANALYTICS_DATABASE_URL?.trim()) return undefined;
  return selected;
}

export type PublicFootballReadProvider = 'neon' | 'turso';

export function tursoConnectionConfig(env: NodeJS.ProcessEnv = process.env) {
  const deployment = getServerDeployment(env);
  const vercelDevelopment = deployment === 'development' && env.VERCEL_ENV === 'development';
  const prefix = deployment === 'production' || vercelDevelopment ? '' : deployment === 'preview' ? 'PREVIEW_' : 'LOCAL_';
  const urlName = `${prefix}TURSO_DATABASE_URL`;
  const tokenName = `${prefix}TURSO_AUTH_TOKEN`;
  const url = env[urlName]?.trim();
  const authToken = env[tokenName]?.trim();
  const validUrl = Boolean(url && /^(libsql|https?):\/\//i.test(url));
  const configured = validUrl && Boolean(authToken);
  return { deployment, configured, url: configured ? url : undefined, authToken: configured ? authToken : undefined,
    message: configured ? undefined : `Turso nije potpuno konfigurisan za ${deployment}; proverite ${urlName} i ${tokenName}.` };
}

export function tursoSnapshotWriteConfig(env: NodeJS.ProcessEnv = process.env) {
  const deployment = getServerDeployment(env);
  const vercelDevelopment = deployment === 'development' && env.VERCEL_ENV === 'development';
  const prefix = deployment === 'production' || vercelDevelopment ? '' : deployment === 'preview' ? 'PREVIEW_' : 'LOCAL_';
  const urlName = `${prefix}TURSO_SNAPSHOT_WRITE_DATABASE_URL`;
  const tokenName = `${prefix}TURSO_SNAPSHOT_WRITE_AUTH_TOKEN`;
  const url = env[urlName]?.trim();
  const authToken = env[tokenName]?.trim();
  const configured = Boolean(url && /^(libsql|https?):\/\//i.test(url) && authToken);
  return { deployment, configured, url: configured ? url : undefined, authToken: configured ? authToken : undefined,
    message: configured ? undefined : `Nedostaje zaseban Turso snapshot write profil za ${deployment}; proverite ${urlName} i ${tokenName}.` };
}

export function publicFootballReadConfig(env: NodeJS.ProcessEnv = process.env): {
  deployment: ServerDeployment;
  provider: PublicFootballReadProvider | 'invalid';
  configured: boolean;
  url?: string;
  authToken?: string;
  message?: string;
} {
  const deployment = getServerDeployment(env);
  const vercelDevelopment = deployment === 'development' && env.VERCEL_ENV === 'development';
  const prefix = deployment === 'production' || vercelDevelopment ? '' : deployment === 'preview' ? 'PREVIEW_' : 'LOCAL_';
  const providerVariable = deployment === 'production' || vercelDevelopment
    ? 'PUBLIC_FOOTBALL_READ_PROVIDER'
    : `${prefix}PUBLIC_FOOTBALL_READ_PROVIDER`;
  const requested = (env[providerVariable] || 'neon').trim().toLowerCase();
  if (requested !== 'neon' && requested !== 'turso') {
    return { deployment, provider: 'invalid', configured: false, message: `${providerVariable} mora biti neon ili turso.` };
  }
  if (requested === 'neon') {
    const configured = Boolean(analyticsDatabaseUrl(env));
    return { deployment, provider: requested as PublicFootballReadProvider, configured, url: undefined as string | undefined, authToken: undefined as string | undefined,
      message: configured ? undefined : 'Neon nije konfigurisan za javni fudbalski pregled.' };
  }
  const target = tursoConnectionConfig(env);
  return { ...target, provider: requested as PublicFootballReadProvider };
}

export function environmentReadiness(env: NodeJS.ProcessEnv = process.env) {
  const deployment = getServerDeployment(env);
  return {
    deployment,
    firebaseAdminConfigured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()) || hasFirestoreEmulator(env),
    analyticsDatabaseConfigured: Boolean(analyticsDatabaseUrl(env)),
    publicFootballDatabase: (() => {
      const { deployment: _deployment, url: _url, authToken: _authToken, ...safe } = publicFootballReadConfig(env);
      return { ...safe, snapshotWriterConfigured: tursoSnapshotWriteConfig(env).configured };
    })(),
    firebaseWritesAllowed: canWriteFirebaseData(env),
    cronAllowed: deployment === 'production' || deployment === 'development' && hasFirestoreEmulator(env),
    paymentsAndEmailAllowed: deployment === 'production',
  };
}
