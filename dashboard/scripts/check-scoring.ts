import { config } from "dotenv";
import { FIXTURE_JOBS } from "../tests/fixtures/jobs";

config({ path: ".env.local", quiet: true });

/**
 * Checks the scoring against the fixture jobs using real Claude calls and your real profile.
 * It costs a few cents and saves nothing:   npm run scoring:check
 */
async function main() {
  const { db } = await import("../lib/db");
  const { hardFilter } = await import("../lib/matching/filters");
  const { llmScore } = await import("../lib/matching/llmScore");
  const { getProfile } = await import("../lib/profile/store");
  const { getSearchSettings } = await import("../lib/search/settings");

  const stored = await getProfile();
  if (!stored) throw new Error("No profile found.");
  const { locations } = await getSearchSettings();

  let wrong = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  for (const job of FIXTURE_JOBS) {
    const filtered = hardFilter(job, stored.profile.preferences, locations, new Date());
    const outcome = filtered ? null : await llmScore(job, stored.profile);
    if (outcome) {
      tokensIn += outcome.inputTokens;
      tokensOut += outcome.outputTokens;
    }
    const score = outcome?.kind === "scored" ? outcome.result.score : null;
    const right =
      job.expected === "reject" ? filtered !== null : job.expected === "strong" ? score !== null && score >= 70 : score !== null && score < 70;
    if (!right) wrong++;
    console.log(`${right ? "ok   " : "WRONG"} expected ${job.expected.padEnd(6)} got ${filtered ? `filtered (${filtered.reason})` : (score ?? outcome?.kind)}  ${job.title}`);
    if (outcome?.kind === "scored") console.log(`      ${outcome.result.verdict}: ${outcome.result.reasoning}`);
  }
  console.log(`tokens: ${tokensIn} in, ${tokensOut} out`);
  await db().$disconnect();
  if (wrong) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
