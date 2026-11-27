import { mkdirSync } from "node:fs";
import path from "node:path";
import { migrations } from "./migrations.js";

export interface AnalyticsDatabase {
  kind: "sqlite" | "postgres";
  query<T = Record<string, any>>(sql: string, values?: unknown[]): Promise<T[]>;
  transaction<T>(run: (db: AnalyticsDatabase) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function analyticsDatabaseConfig() {
  const remote = Boolean(process.env.ANALYTICS_DATABASE_URL?.trim());
  const local = !process.env.VERCEL && process.env.NODE_ENV !== "production";
  return {
    configured: remote || local,
    kind: remote ? "postgres" : local ? "sqlite" : "unconfigured",
    message:
      remote || local
        ? undefined
        : "Povežite zasebnu PostgreSQL bazu kroz ANALYTICS_DATABASE_URL. Produkcijski Firestore se ne koristi.",
  };
}

export async function openAnalyticsDatabase(
  file?: string,
): Promise<AnalyticsDatabase> {
  if (!file && process.env.ANALYTICS_DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });
    const wrap = (connection: any): AnalyticsDatabase => ({
      kind: "postgres",
      query: async (sql, values = []) =>
        (await connection.query(sql, values)).rows,
      transaction: async (run) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const value = await run(wrap(client));
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    });
    return wrap(pool);
  }
  if (!file && !analyticsDatabaseConfig().configured)
    throw new Error("ANALYTICS_DATABASE_URL nije podešen.");
  const target =
    file ||
    process.env.ANALYTICS_SQLITE_PATH ||
    path.resolve(".local-data/football-analytics.sqlite");
  if (target !== ":memory:")
    mkdirSync(path.dirname(target), { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const connection = new DatabaseSync(target);
  connection.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;");
  let tail = Promise.resolve();
  const db: AnalyticsDatabase = {
    kind: "sqlite",
    query: async (sql, values = []) => {
      // PostgreSQL's numbered bindings are converted without changing binding order.
      const bound: unknown[] = [];
      const prepared = sql.replace(/\$(\d+)/g, (_, index) => {
        bound.push(values[Number(index) - 1]);
        return "?";
      });
      const statement = connection.prepare(prepared);
      if (/^\s*(SELECT|WITH|PRAGMA)|\bRETURNING\b/i.test(prepared))
        return statement.all(...(bound as any[])) as any;
      statement.run(...(bound as any[]));
      return [];
    },
    transaction: (run) => {
      const task = tail.then(async () => {
        connection.exec("BEGIN IMMEDIATE");
        try {
          const value = await run(db);
          connection.exec("COMMIT");
          return value;
        } catch (error) {
          connection.exec("ROLLBACK");
          throw error;
        }
      });
      tail = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
    close: async () => connection.close(),
  };
  return db;
}
let shared: Promise<AnalyticsDatabase> | undefined;
export const getAnalyticsDatabase = () => (shared ||= openAnalyticsDatabase());
export async function migrateAnalytics(db: AnalyticsDatabase) {
  for (const migration of migrations)
    await db.transaction(async (tx) => {
      await tx.query(migrations[0].statements[0]);
      if (
        (
          await tx.query("SELECT version FROM fa_schema WHERE version = $1", [
            migration.version,
          ])
        ).length
      )
        return;
      for (const statement of migration.statements.slice(1))
        await tx.query(statement);
      await tx.query("INSERT INTO fa_schema(version) VALUES($1)", [
        migration.version,
      ]);
    });
}
export async function analyticsSchemaReady(db: AnalyticsDatabase) {
  try {
    return (
      (await db.query("SELECT version FROM fa_schema WHERE version = $1", [1]))
        .length > 0
    );
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const message = error instanceof Error ? error.message : "";
    if (code === "42P01" || (db.kind === "sqlite" && /no such table: fa_schema\b/i.test(message)))
      return false;
    throw error;
  }
}
