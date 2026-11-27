import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAnalyticsHandler } from "../api/football-analytics.js";
import type { AnalyticsDatabase } from "../server/footballAnalytics/database.js";

function response() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; },
    end(body: string) { this.body = body; },
  };
}

async function call(
  handler: ReturnType<typeof createAnalyticsHandler>,
  url: string,
  method = "GET",
  body?: unknown,
  authorization?: string,
) {
  const request = Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), {
    url,
    method,
    headers: authorization ? { authorization } : {},
  });
  const result = response();
  await handler(request as never, result as never);
  return { ...result, json: result.body ? JSON.parse(result.body) : null };
}

function mockDatabase() {
  const providers = new Map<string, string>();
  let writes = 0;
  const db = {
    kind: "sqlite",
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT version FROM fa_schema")) return [{ version: 1 }];
      if (sql.startsWith("SELECT id,payload FROM fa_providers"))
        return [...providers].map(([id, payload]) => ({ id, payload }));
      if (sql.startsWith("INSERT INTO fa_providers")) {
        writes += 1;
        providers.set(String(values[0]), String(values[1]));
      }
      return [];
    },
    transaction: async <T>(run: (database: AnalyticsDatabase) => Promise<T>) => run(db as unknown as AnalyticsDatabase),
    close: async () => {},
  } as unknown as AnalyticsDatabase;
  return { db, writes: () => writes, providers };
}

test("source registry and dry-run remain admin-only and do not open databases or providers", async () => {
  const previousEnvironment = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "development";
  let databaseCalls = 0;
  try {
    const handler = createAnalyticsHandler(
      async (request) => request.headers.authorization === "Bearer admin",
      async () => { databaseCalls += 1; throw new Error("registry-only endpoints must not connect to SQL"); },
      () => false,
      async () => {},
    );
    for (const action of ["source-registry", "source-dry-run"]) {
      const denied = await call(handler, `/api/football-analytics?action=${action}`);
      assert.equal(denied.statusCode, 403);
      const allowed = await call(handler, `/api/football-analytics?action=${action}`, "GET", undefined, "Bearer admin");
      assert.equal(allowed.statusCode, 200);
      assert.equal(allowed.json.registryOnly, true);
      if (action === "source-registry") assert.equal(allowed.json.databaseChecked, false);
    }
    const dryRun = await call(handler, "/api/football-analytics?action=source-dry-run", "GET", undefined, "Bearer admin");
    assert.equal(dryRun.json.dryRun, true);
    assert.equal(dryRun.json.providerRequests, 0);
    assert.equal(dryRun.json.databaseWrites, 0);
    assert.equal(databaseCalls, 0);
  } finally {
    if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnvironment;
  }
});
test("source policy changes require admin auth and enforce permission gates on the server", async () => {
  const previousEnvironment = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "development";
  const { db, writes, providers } = mockDatabase();
  let databaseCalls = 0;
  const handler = createAnalyticsHandler(
    async (request) => request.headers.authorization === "Bearer admin",
    async () => { databaseCalls += 1; return db; },
    () => false,
    async () => {},
  );
  try {
    const guest = await call(handler, "/api/football-analytics?action=source-policy", "POST", {
      sourceId: "openligadb", scope: "public", enabled: true, acknowledgeConditions: true,
    });
    assert.equal(guest.statusCode, 403);
    assert.equal(databaseCalls, 0);
    assert.equal(writes(), 0);

    const unsupported = await call(handler, "/api/football-analytics?action=source-policy", "POST", {
      sourceId: "api-football", scope: "public", enabled: true, acknowledgeConditions: true,
    }, "Bearer admin");
    assert.equal(unsupported.statusCode, 409);
    assert.equal(writes(), 0);

    const noAcknowledgement = await call(handler, "/api/football-analytics?action=source-policy", "POST", {
      sourceId: "openligadb", scope: "public", enabled: true,
    }, "Bearer admin");
    assert.equal(noAcknowledgement.statusCode, 409);
    assert.equal(writes(), 0);

    const approved = await call(handler, "/api/football-analytics?action=source-policy", "POST", {
      sourceId: "openligadb", scope: "public", enabled: true, acknowledgeConditions: true,
    }, "Bearer admin");
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json.source.enabled.public, true);
    assert.equal(writes(), 1);
    const stored = JSON.parse(providers.get("openligadb") || "{}");
    assert.equal(typeof stored.activation.publicAcknowledgedAt, "string");

    const malformed = await call(handler, "/api/football-analytics?action=source-policy", "POST", {
      sourceId: "../admin", scope: "public", enabled: true,
    }, "Bearer admin");
    assert.equal(malformed.statusCode, 400);
    assert.equal(writes(), 1);
  } finally {
    if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnvironment;
  }
});
