import { db } from "@/lib/db";
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

/** Leaves the stored CV text alone unless a new one is passed. */
export async function saveProfile(profile: Profile, cvText?: string): Promise<Date> {
  return db().$transaction(async (tx) => {
    const existing = await tx.profile.findFirst({ orderBy: { updatedAt: "asc" }, select: { id: true } });
    const saved = existing
      ? await tx.profile.update({ where: { id: existing.id }, data: { json: profile, cvText } })
      : await tx.profile.create({ data: { json: profile, cvText } });
    await tx.auditLog.create({
      data: { action: "profile.saved", payload: { cvUpdated: cvText !== undefined } },
    });
    return saved.updatedAt;
  });
}
