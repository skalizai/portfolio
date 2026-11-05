import { SearchSettingsForm } from "@/components/SearchSettingsForm";
import { ScreeningForm } from "@/components/ScreeningForm";
import { getScreeningAnswers } from "@/lib/search/screening";
import { getSearchSettings } from "@/lib/search/settings";
import { requestsPerDayFromEnv } from "@/lib/sources/jsearch";

export default async function SettingsPage() {
  const [{ keywords, locations, minScore, scoreDailyCap, draftDailyCap, dailyApplyCap }, screening] = await Promise.all([getSearchSettings(), getScreeningAnswers()]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-dim">Choose what the morning job search looks for, and how jobs are scored.</p>
      <SearchSettingsForm initial={{ keywords, locations, minScore, scoreDailyCap, draftDailyCap, dailyApplyCap }} requestsPerDay={requestsPerDayFromEnv()} />
      <ScreeningForm initial={screening} />
    </>
  );
}
