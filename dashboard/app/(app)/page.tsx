import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { DASHBOARD_LINKS } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { getJobsOverview } from "@/lib/jobs/overview";
import { getProfile } from "@/lib/profile/store";
import { getSearchSettings } from "@/lib/search/settings";

const timeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });

function Chip({ title, detail, className }: { title: string; detail: string; className: string }) {
  return (
    <div className={`absolute rounded-2xl border border-line bg-surface/90 px-4 py-3 font-mono text-xs shadow-xl backdrop-blur ${className}`}>
      <p className="font-semibold text-txt">{title}</p>
      <p className="mt-1 text-dim">{detail}</p>
    </div>
  );
}

/** The landing page: who you are, where the search stands, and a way into each section. */
export default async function HomePage() {
  const [overview, stored, settings] = await Promise.all([getJobsOverview(), getProfile(), getSearchSettings()]);
  const profile = stored?.profile;
  // The name you go by: "Muhammad Sohail Khan Alizai" is greeted as Sohail.
  const names = profile?.name.split(/\s+/).filter(Boolean) ?? [];
  const firstName = (/^(muhammad|mohammad|mohammed|muhammed|md\.?)$/i.test(names[0] ?? "") ? names[1] : names[0]) ?? "there";
  const top = overview.matches[0];
  const drafts = [...overview.matches, ...overview.sponsorshipUnknown, ...overview.below].filter((job) => job.application && !job.application.submitted).length;

  const stats = [
    { value: profile?.yearsExperience ? `${profile.yearsExperience}+` : "–", label: "Years in SAP" },
    { value: overview.matches.length, label: `Matches at ${overview.minScore}+` },
    { value: overview.averageScore ?? "–", label: "Average match score" },
    { value: overview.applied.length, label: "Jobs applied for" },
  ];

  const tileDetail: Record<string, string> = {
    "/matches": `${overview.newMatches} new today · ${overview.matches.length} in total`,
    "/applications": `${drafts} cover ${drafts === 1 ? "letter" : "letters"} ready · ${overview.applied.length} applied`,
    "/profile": profile?.headline || "Your CV and what you're looking for",
    "/settings": `${settings.keywords.length} keywords · ${settings.locations.length} places · ${settings.sponsorshipRules.length} visa rules`,
    "/logs": overview.lastSearchAt ? `Last search ${timeFormat.format(overview.lastSearchAt)}` : "No search has run yet",
  };

  return (
    <>
      <section aria-labelledby="hero-title" className="grid items-center gap-10 py-6 lg:grid-cols-[1.15fr_1fr] lg:py-12">
        <div className="min-w-0">
          <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface/60 px-4 py-1.5 font-mono text-xs tracking-wider text-dim uppercase">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand" />
            <span className="truncate">
              {profile?.headline || "Job search"}
              {profile?.location ? ` · ${profile.location}` : ""}
            </span>
          </p>
          <h1 id="hero-title" className="mt-6 text-4xl leading-tight font-semibold tracking-tight break-words sm:text-6xl">
            Welcome back, {firstName}.
            <span className="text-gradient-accent block pb-1">Your next role is in here.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-dim">
            {overview.newMatches
              ? `${overview.newMatches} new ${overview.newMatches === 1 ? "match" : "matches"} since yesterday. `
              : "No new matches since yesterday. "}
            Every morning the search scores new SAP roles against your profile and emails you the best at 9am.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="h-12 rounded-xl px-6 text-base">
              <Link href="/matches">
                View job matches <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="h-12 rounded-xl border border-line-strong px-6 text-base">
              <Link href="/applications">Applications</Link>
            </Button>
          </div>
          <dl className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {stats.map(({ value, label }) => (
              <div key={label} className="flex flex-col">
                <dt className="text-sm text-dim">{label}</dt>
                <dd className="text-gradient-accent order-first font-display text-4xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-sm px-6 py-10">
          <div aria-hidden className="bg-gradient-accent absolute inset-6 rotate-3 rounded-[2rem] opacity-25 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-line">
            {/* Served as is, because the image optimiser fetches without your sign-in and would be refused. */}
            <Image src="/profile.jpg" alt={profile?.name ?? "Profile photo"} width={700} height={894} priority unoptimized className="h-auto w-full object-cover" />
          </div>
          {top && <Chip title={`Top match · ${top.match!.score}`} detail={`${top.company}`} className="top-2 -left-2 max-w-[70%] truncate" />}
          <Chip title={`${overview.newMatches} new today`} detail="Scored against your CV" className="top-1/2 -right-3" />
          <Chip title="● Next email" detail="9am UAE · Yahoo" className="bottom-2 left-4" />
        </div>
      </section>

      <section aria-labelledby="dashboard-title" className="mt-6 rounded-[2rem] border border-line bg-surface/70 p-5 sm:p-8">
        <p className="font-mono text-xs tracking-wider text-accent-text uppercase">Sections</p>
        <h2 id="dashboard-title" className="mt-1 text-2xl font-semibold">
          Job Dashboard
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {DASHBOARD_LINKS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="group flex h-full flex-col rounded-2xl border border-line bg-bg/60 p-4 transition-colors hover:border-line-strong">
                <span className="bg-gradient-accent flex size-10 items-center justify-center rounded-xl text-on-accent">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="mt-4 flex items-center justify-between font-display font-semibold">
                  {label}
                  <ArrowRight aria-hidden className="size-4 text-dim transition-transform group-hover:translate-x-1" />
                </span>
                <span className="mt-1 text-sm break-words text-dim">{tileDetail[href]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
