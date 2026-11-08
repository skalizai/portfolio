import { SearchSettingsForm } from "@/components/SearchSettingsForm";
import { ScreeningForm } from "@/components/ScreeningForm";
import { SponsorshipForm } from "@/components/SponsorshipForm";
import { getScreeningAnswers } from "@/lib/search/screening";
import { getSearchSettings } from "@/lib/search/settings";
import { requestsPerDayFromEnv } from "@/lib/sources/jsearch";

export default async function SettingsPage() {
  const [{ keywords, locations, minScore, scoreDailyCap, draftDailyCap, dailyApplyCap, sponsorshipRules }, screening] = await Promise.all([getSearchSettings(), getScreeningAnswers()]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-dim">Choose what the morning job search looks for, and how jobs are scored.</p>
      {/* Keyed on the locations, so it shows any country added by the sponsorship section. */}
      <SearchSettingsForm key={locations.join("|")} initial={{ keywords, locations, minScore, scoreDailyCap, draftDailyCap, dailyApplyCap }} requestsPerDay={requestsPerDayFromEnv()} />
      <SponsorshipForm initial={sponsorshipRules} />
      <ScreeningForm initial={screening} />
    </>
  );
}
