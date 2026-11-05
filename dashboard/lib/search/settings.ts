import { z } from "zod";
import { db } from "@/lib/db";
import { getProfile } from "@/lib/profile/store";

/** Trims each entry and drops repeats, ignoring case, so "dubai" and "Dubai" don't search twice. */
const uniqueList = (label: string) =>
  z
    .array(z.string().trim().max(100, `${label} must be 100 characters or fewer`))
    .transform((items) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = item.toLowerCase();
        if (!item || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .refine((items) => items.length > 0, `Add at least one entry under ${label}`)
    .refine((items) => items.length <= 30, `${label} can have at most 30 entries`);

export const SearchSettingsSchema = z.object({
  keywords: uniqueList("Keywords"),
  locations: uniqueList("Countries"),
  minScore: z.number({ error: "Enter a minimum score" }).int().min(0, "Minimum score must be 0 to 100").max(100, "Minimum score must be 0 to 100"),
  scoreDailyCap: z.number({ error: "Enter a daily scoring limit" }).int().min(0, "The daily limit must be 0 to 500").max(500, "The daily limit must be 0 to 500"),
  draftDailyCap: z.number({ error: "Enter a daily draft limit" }).int().min(0, "The draft limit must be 0 to 50").max(50, "The draft limit must be 0 to 50"),
});

export type SearchSettings = z.infer<typeof SearchSettingsSchema>;

/** The saved search, falling back to the profile's target titles and locations until one is saved. */
export async function getSearchSettings(): Promise<SearchSettings & { sourcesEnabled: string[]; visaSponsorshipLocations: string[] }> {
  const [config, stored] = await Promise.all([
    db().searchConfig.findFirst({ orderBy: { updatedAt: "desc" } }),
    getProfile(),
  ]);
  return {
    keywords: config?.keywords.length ? config.keywords : (stored?.profile.targetTitles ?? []),
    locations: config?.locations.length ? config.locations : (stored?.profile.preferences.locations ?? []),
    sourcesEnabled: config?.sourcesEnabled ?? [],
    visaSponsorshipLocations: stored?.profile.preferences.visaSponsorshipLocations ?? [],
    minScore: config?.minScore ?? 70,
    scoreDailyCap: config?.scoreDailyCap ?? 50,
    draftDailyCap: config?.draftDailyCap ?? 5,
  };
}

export async function saveSearchSettings(settings: SearchSettings): Promise<void> {
  await db().$transaction(async (tx) => {
    const existing = await tx.searchConfig.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } });
    if (existing) await tx.searchConfig.update({ where: { id: existing.id }, data: settings });
    else await tx.searchConfig.create({ data: { ...settings, sourcesEnabled: [] } });
    // Free to redo, and a job ruled out for its location may now be wanted.
    await tx.matchScore.deleteMany({ where: { modelVersion: "rules" } });
    await tx.auditLog.create({
      data: { action: "search.saved", payload: { keywords: settings.keywords.length, locations: settings.locations.length, minScore: settings.minScore, scoreDailyCap: settings.scoreDailyCap, draftDailyCap: settings.draftDailyCap } },
    });
  });
}
