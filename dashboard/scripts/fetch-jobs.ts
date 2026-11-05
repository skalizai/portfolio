import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Runs a job fetch from the terminal.
 *   npm run jobs:fetch                                 the next search in the rotation
 *   npm run jobs:fetch -- "SAP CPI Architect Dubai" ae one specific search
 */
async function main() {
  const { db } = await import("../lib/db");
  const { runJobFetch } = await import("../lib/jobs/fetchJobs");

  const [query, country] = process.argv.slice(2);
  const report = await runJobFetch(query ? { manualQuery: { query, country } } : {});
  console.log(JSON.stringify(report, null, 2));
  await db().$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
