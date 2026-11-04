import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/** Loads data/profile.json into the database once. It never overwrites a saved profile. */
async function main() {
  const { db } = await import("../lib/db");
  const { ProfileSchema } = await import("../lib/profile/schema");
  const { getProfile, saveProfile } = await import("../lib/profile/store");

  if (await getProfile()) {
    console.log("A profile already exists, so nothing was changed.");
  } else {
    const profile = ProfileSchema.parse(JSON.parse(readFileSync("data/profile.json", "utf8")));
    const cvText = existsSync("data/cv.txt") ? readFileSync("data/cv.txt", "utf8") : undefined;
    await saveProfile(profile, cvText);
    console.log("Profile loaded.");
  }
  await db().$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
