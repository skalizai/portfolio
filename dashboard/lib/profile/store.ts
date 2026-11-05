import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { EMPTY_PROFILE, ProfileSchema, type Profile } from "@/lib/profile/schema";

export type StoredProfile = { profile: Profile; cvText: string | null; updatedAt: Date };

/** There is one profile, so the oldest row is the only row. */
export async function getProfile(): Promise<StoredProfile | null> {
  const row = await db().profile.findFirst({ orderBy: { updatedAt: "asc" } });
  if (!row) return null;
  // Fill in any fields added to the schema since this row was saved.
  const saved = row.json as Partial<Profile>;
  const profile = ProfileSchema.parse({
    ...EMPTY_PROFILE,
    ...saved,
    contact: { ...EMPTY_PROFILE.contact, ...saved.contact },
    preferences: { ...EMPTY_PROFILE.preferences, ...saved.preferences },
  });
  return { profile, cvText: row.cvText, updatedAt: row.updatedAt };
}

/**
 * Stores an uploaded CV straight away. Written directly so this doesn't change updatedAt, because a
 * new CV shouldn't re-score every job until you've chosen what changes in your profile.
 */
export async function saveCvText(cvText: string): Promise<void> {
  await db().$executeRaw`UPDATE "jobmatch"."Profile" SET "cvText" = ${cvText}, "cvStructured" = NULL`;
  await db().auditLog.create({ data: { action: "cv.saved", payload: { characters: cvText.length } } });
}

/** Leaves the stored CV text alone unless a new one is passed. */
export async function saveProfile(profile: Profile, cvText?: string): Promise<Date> {
  return db().$transaction(async (tx) => {
    const existing = await tx.profile.findFirst({ orderBy: { updatedAt: "asc" }, select: { id: true } });
    const saved = existing
      ? await tx.profile.update({
          where: { id: existing.id },
          // A new CV clears the structured copy, so that it's parsed again when next needed.
          data: { json: profile, cvText, ...(cvText !== undefined ? { cvStructured: Prisma.DbNull } : {}) },
        })
      : await tx.profile.create({ data: { json: profile, cvText } });
    await tx.auditLog.create({
      data: { action: "profile.saved", payload: { cvUpdated: cvText !== undefined } },
    });
    return saved.updatedAt;
  });
}
