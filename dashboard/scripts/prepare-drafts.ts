import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/** Prepares drafts for the best new matches, within the daily limit:   npm run drafts:prepare */
async function main() {
  const { db } = await import("../lib/db");
  const { prepareNewMatches } = await import("../lib/apply/prepare");
  console.log(JSON.stringify(await prepareNewMatches(), null, 2));
  await db().$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
