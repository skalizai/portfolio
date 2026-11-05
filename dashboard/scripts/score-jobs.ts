import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/** Scores any jobs that haven't been scored yet, within the daily limit:   npm run jobs:score */
async function main() {
  const { db } = await import("../lib/db");
  const { scoreNewJobs } = await import("../lib/matching/scoreJobs");
  console.log(JSON.stringify(await scoreNewJobs(), null, 2));
  await db().$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
