import test from 'node:test';
import assert from 'node:assert/strict';
import { publicFootballReadConfig, tursoConnectionConfig } from '../server/runtimeEnvironment.ts';
import { createPublicSnapshotLoader } from '../server/publicFootball/databaseRouter.ts';
import { snapshotFromMatches } from '../server/publicFootball/store.ts';
import { runTursoIsolatedSelfTest } from '../server/publicFootball/tursoSnapshot.ts';

test('Turso self-test keeps temporary DDL, write and read inside one transaction batch', async () => {
  let calls = 0;
  let statements: Array<string | { sql: string; args?: unknown[] }> = [];
  let mode = '';
  const client = {
    batch: async (items: typeof statements, batchMode: string) => {
      calls++;
      statements = items;
      mode = batchMode;
      return [{ rows: [] }, { rows: [] }, { rows: [{ value: 'read-write-ok' }] }, { rows: [] }];
    },
  } as unknown as Pick<import('@libsql/client').Client, 'batch'>;
  const result = await runTursoIsolatedSelfTest({
    deployment: 'development', configured: true, url: 'libsql://dev-eu.turso.io', authToken: 'test-token',
  }, client);
  const sql = statements.map((item) => typeof item === 'string' ? item : item.sql).join('\n');
  const table = sql.match(/__elite_turso_check_[a-z0-9]+/)?.[0];
  assert.equal(calls, 1);
  assert.equal(mode, 'write');
  assert.ok(table);
  assert.match(sql, new RegExp(`CREATE TEMP TABLE ${table}`));
  assert.match(sql, new RegExp(`INSERT INTO ${table}`));
  assert.match(sql, new RegExp(`SELECT value FROM ${table}`));
  assert.match(sql, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  assert.deepEqual(result, { writeReadVerified: true, persistentDataChanged: false });
});

test('public database routing is isolated by deployment and never borrows production Turso credentials', () => {
  const production = publicFootballReadConfig({
    VERCEL_ENV: 'production',
    PUBLIC_FOOTBALL_READ_PROVIDER: 'turso',
    TURSO_DATABASE_URL: 'libsql://elite-eu.turso.io',
    TURSO_AUTH_TOKEN: 'prod-token',
  } as NodeJS.ProcessEnv);
  assert.equal(production.provider, 'turso');
  assert.equal(production.configured, true);
  assert.equal(production.authToken, 'prod-token');

  const preview = publicFootballReadConfig({
    VERCEL_ENV: 'preview',
    PUBLIC_FOOTBALL_READ_PROVIDER: 'turso',
    TURSO_DATABASE_URL: 'libsql://elite-eu.turso.io',
    TURSO_AUTH_TOKEN: 'prod-token',
  } as NodeJS.ProcessEnv);
  assert.equal(preview.provider, 'neon');
  assert.equal(preview.configured, false);

  const explicitlyBroken = publicFootballReadConfig({
    VERCEL_ENV: 'production',
    PUBLIC_FOOTBALL_READ_PROVIDER: 'turso',
    TURSO_DATABASE_URL: 'libsql://elite-eu.turso.io',
  } as NodeJS.ProcessEnv);
  assert.equal(explicitlyBroken.provider, 'turso');
  assert.equal(explicitlyBroken.configured, false);
});

test('Vercel Development reads its scoped Turso variables while local and Preview remain isolated', () => {
  const development = publicFootballReadConfig({
    VERCEL_ENV: 'development',
    PUBLIC_FOOTBALL_READ_PROVIDER: 'turso',
    TURSO_DATABASE_URL: 'libsql://dev-eu.turso.io',
    TURSO_AUTH_TOKEN: 'dev-token',
    ANALYTICS_DATABASE_URL: 'postgres://production-only',
  } as NodeJS.ProcessEnv);
  assert.equal(development.provider, 'turso');
  assert.equal(development.configured, true);
  assert.equal(development.authToken, 'dev-token');

  const local = tursoConnectionConfig({
    LOCAL_TURSO_DATABASE_URL: 'libsql://local-eu.turso.io',
    LOCAL_TURSO_AUTH_TOKEN: 'local-token',
    TURSO_DATABASE_URL: 'libsql://vercel-dev-only.turso.io',
    TURSO_AUTH_TOKEN: 'vercel-dev-only-token',
  } as NodeJS.ProcessEnv);
  assert.equal(local.configured, true);
  assert.equal(local.url, 'libsql://local-eu.turso.io');
  assert.equal(local.authToken, 'local-token');

  const preview = publicFootballReadConfig({
    VERCEL_ENV: 'preview',
    PUBLIC_FOOTBALL_READ_PROVIDER: 'turso',
    TURSO_DATABASE_URL: 'libsql://dev-eu.turso.io',
    TURSO_AUTH_TOKEN: 'dev-token',
  } as NodeJS.ProcessEnv);
  assert.equal(preview.provider, 'neon');
  assert.equal(preview.configured, false);
});

test('explicit Turso routing fails closed and does not fall back to Neon', async () => {
  let neonCalls = 0;
  let tursoCalls = 0;
  const loader = createPublicSnapshotLoader({
    config: () => ({ deployment: 'production', provider: 'turso', configured: true, url: 'libsql://test.turso.io', authToken: 'secret' }),
    neon: async () => { neonCalls++; throw new Error('Neon must not be reached'); },
    turso: async () => { tursoCalls++; throw new Error('Turso is unavailable'); },
  });

  await assert.rejects(loader(), /Turso is unavailable/);
  assert.equal(tursoCalls, 1);
  assert.equal(neonCalls, 0);
});

test('public snapshot read remains routed to Neon until Turso is explicitly selected', async () => {
  const expected = snapshotFromMatches([]);
  let neonCalls = 0;
  let tursoCalls = 0;
  const loader = createPublicSnapshotLoader({
    config: () => ({ deployment: 'production', provider: 'neon', configured: true }),
    neon: async () => { neonCalls++; return { kind: 'sqlite', query: async () => [{ payload: JSON.stringify(expected) }] } as any; },
    turso: async () => { tursoCalls++; return expected; },
  });
  assert.deepEqual(await loader(), expected);
  assert.equal(neonCalls, 1);
  assert.equal(tursoCalls, 0);
});
