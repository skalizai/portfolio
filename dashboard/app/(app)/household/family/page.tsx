import { Cake, Download, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/household/Avatar";
import { Button } from "@/components/ui/button";
import { ageOn, daysToBirthday, FAMILY_RELATIONSHIP_LABELS, familyExpiries, listFamily, whenText } from "@/lib/household/family";
import { mask } from "@/lib/household/money";
import { getHouseholdSettings } from "@/lib/household/settings";

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

const START = [
  { relationship: "SELF", label: "Add yourself" },
  { relationship: "WIFE", label: "Add your wife" },
  { relationship: "SON", label: "Add a son" },
  { relationship: "DAUGHTER", label: "Add a daughter" },
];

export default async function FamilyPage() {
  const [members, settings] = await Promise.all([listFamily(), getHouseholdSettings()]);
  const alerts = familyExpiries(members, settings.expiryAlertDays);
  const today = new Date();
  const hasSelf = members.some((m) => m.relationship === "SELF");
  const hasWife = members.some((m) => m.relationship === "WIFE");
  const suggestions = START.filter((s) => (s.relationship === "SELF" ? !hasSelf : s.relationship === "WIFE" ? !hasWife : true));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">Family</h1>
          <p className="mt-2 max-w-2xl text-dim">You, your wife and children, and the rest of the family, with passports, CNICs and photos. Numbers are shortened here; open someone to see them in full.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {members.length > 0 && (
            <Button asChild variant="ghost" className="h-11 border border-line-strong">
              {/* A file download, not a page, so a plain link is right. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/household/family/export">
                <Download aria-hidden className="size-4" /> Export to Excel
              </a>
            </Button>
          )}
          <Button asChild className="h-11">
            <Link href="/household/family/new">
              <Plus aria-hidden className="size-4" /> Add family member
            </Link>
          </Button>
        </div>
      </div>

      {alerts.length > 0 && (
        <section aria-labelledby="family-renewals" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
          <h2 id="family-renewals" className="flex items-center gap-2 font-semibold">
            <TriangleAlert aria-hidden className="size-5 text-brand-2" /> Documents to renew
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {alerts.map((a) => (
              <li key={`${a.memberId}-${a.document}`}>
                <Link href={`/household/family/${a.memberId}`} className="hover:underline">
                  {a.name} {a.document} {whenText(a.daysLeft)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {members.length ? (
        <ul aria-label="Family members" className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const age = ageOn(m.dateOfBirth, today);
            const birthday = daysToBirthday(m.dateOfBirth, today);
            const child = m.relationship === "SON" || m.relationship === "DAUGHTER";
            return (
              <li key={m.id}>
                <Link href={`/household/family/${m.id}`} className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-line bg-surface transition-colors hover:border-line-strong">
                  <div className="relative">
                    <Avatar fileId={m.photoFileId} name={m.fullName} className="aspect-[4/3] w-full text-5xl transition-transform duration-500 group-hover:scale-[1.03]" />
                    <span className="absolute top-3 left-3 rounded-full bg-bg/80 px-3 py-1 text-xs font-medium backdrop-blur">{FAMILY_RELATIONSHIP_LABELS[m.relationship]}</span>
                    {birthday !== null && birthday <= 30 && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-bg/80 px-3 py-1 text-xs font-medium backdrop-blur">
                        <Cake aria-hidden className="size-3.5 text-brand-2" />
                        {birthday === 0 ? "Birthday today" : `Birthday in ${birthday} ${birthday === 1 ? "day" : "days"}`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="font-display text-lg font-semibold break-words">{m.fullName}</p>
                    <p className="text-sm text-dim">{[age !== null ? `${age} ${age === 1 ? "year" : "years"}` : null, m.city, m.bloodGroup && `Blood ${m.bloodGroup}`].filter(Boolean).join(" · ") || " "}</p>
                    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      <dt className="text-dim">{child ? "B-Form" : "CNIC"}</dt>
                      <dd className="font-mono">{mask(m.cnicNo)}</dd>
                      <dt className="text-dim">Passport</dt>
                      <dd className="font-mono">
                        {mask(m.passportNo)}
                        {m.passportExpiry && <span className="font-sans text-dim"> · to {monthYear.format(m.passportExpiry)}</span>}
                      </dd>
                      {m.emiratesIdNo && (
                        <>
                          <dt className="text-dim">Emirates ID</dt>
                          <dd className="font-mono">{mask(m.emiratesIdNo)}</dd>
                        </>
                      )}
                      <dt className="text-dim">Documents</dt>
                      <dd>{m.documents.length}</dd>
                    </dl>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5 text-dim">Nobody yet. Start with yourself and your wife, then add the children.</p>
      )}

      {suggestions.length > 0 && (
        <nav aria-label="Add someone" className="mt-6 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Link key={s.relationship} href={`/household/family/new?relationship=${s.relationship}`} className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-sm hover:bg-surface-2">
              <Plus aria-hidden className="size-4" /> {s.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
