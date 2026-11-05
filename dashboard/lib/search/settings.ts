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
});

export type SearchSettings = z.infer<typeof SearchSettingsSchema>;

/** The saved search, falling back to the profile's target titles and locations until one is saved. */
export async function getSearchSettings(): Promise<SearchSettings & { sourcesEnabled: string[] }> {
  const [config, stored] = await Promise.all([
    db().searchConfig.findFirst({ orderBy: { updatedAt: "desc" } }),
    getProfile(),
  ]);
  return {
    keywords: config?.keywords.length ? config.keywords : (stored?.profile.targetTitles ?? []),
    locations: config?.locations.length ? config.locations : (stored?.profile.preferences.locations ?? []),
    sourcesEnabled: config?.sourcesEnabled ?? [],
  };
}

export async function saveSearchSettings(settings: SearchSettings): Promise<void> {
  await db().$transaction(async (tx) => {
    const existing = await tx.searchConfig.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } });
    if (existing) await tx.searchConfig.update({ where: { id: existing.id }, data: settings });
    else await tx.searchConfig.create({ data: { ...settings, sourcesEnabled: [] } });
    await tx.auditLog.create({
      data: { action: "search.saved", payload: { keywords: settings.keywords.length, locations: settings.locations.length } },
    });
  });
}
