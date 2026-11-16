import dotenv from "dotenv";
dotenv.config({ path: ".env.analysis.local", quiet: true });
import {
  openAnalyticsDatabase,
  migrateAnalytics,
} from "../server/footballAnalytics/database.js";
import {
  discoverAnalyticsCatalog,
  importAnalyticsStep,
} from "../server/footballAnalytics/importer.js";
import {
  analyticsTotals,
  readCoverage,
} from "../server/footballAnalytics/store.js";

const command = process.argv[2] || "report";
const argument = (name: string) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const db = await openAnalyticsDatabase();
try {
  if (command === "migrate") {
    await migrateAnalytics(db);
    console.log("Analytics schema ready (isolated database).");
  } else if (command === "catalog")
    console.log(JSON.stringify(await discoverAnalyticsCatalog(db)));
  else if (command === "import") {
    const steps = Math.min(500, Math.max(1, Number(argument("steps") || 1)));
    for (let i = 0; i < steps; i++) {
      const result = await importAnalyticsStep(db, argument("id"), {
        provider: argument("provider"),
        environment: argument("environment") === "test" ? "test" : "real",
        batchSize: 50,
        refresh: i === 0 && process.argv.includes("--refresh"),
      });
      console.log(JSON.stringify({ step: i + 1, ...result }));
      if (
        result.error ||
        result.busy ||
        (!result.processed && result.done) ||
        (argument("id") && result.done)
      )
        break;
    }
  } else if (command !== "report")
    throw new Error("Use migrate, catalog, import or report.");
  const coverage = await readCoverage(db);
  console.log(
    JSON.stringify({
      real: await analyticsTotals(db),
      test: await analyticsTotals(db, "test"),
      jobs: coverage.reduce<Record<string, number>>((counts, row) => {
        const key = `${row.environment}:${row.state}`;
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {}),
      ...(process.argv.includes("--coverage") ? { coverage } : {}),
    }),
  );
} finally {
  await db.close();
}
