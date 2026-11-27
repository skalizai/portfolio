import { ArrowRight, ArrowUpRight, BriefcaseBusiness, Cake, CircleCheck, Heart, House, IdCard, Receipt, Send, Sparkles, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FamilyPicker, type PickerMember } from "@/components/home/FamilyPicker";
import { FocusBoard } from "@/components/home/FocusBoard";
import { LiveClocks } from "@/components/LiveClocks";
import { firstNameOf, getHomeData, greeting, HOME_TIME_ZONE, type Attention } from "@/lib/home";
import { ageOn, daysToBirthday, FAMILY_RELATIONSHIP_LABELS, whenText } from "@/lib/household/family";
import { formatPkr, type Num } from "@/lib/household/money";
import { aed, signedAed, tone } from "@/lib/investments/format";
import { DASHBOARD_LINKS } from "@/lib/nav";

const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: HOME_TIME_ZONE });
const hijriFormat = new Intl.DateTimeFormat("en-GB-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: HOME_TIME_ZONE });
const shortMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: HOME_TIME_ZONE });

// Whole dirhams read faster here; the Household pages keep the fils.
const aedWhole = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 });
const formatAed = (value: Num) => aedWhole.format(Number(value));

const TONE = {
  urgent: { label: "Now", dot: "bg-loss" },
  soon: { label: "Soon", dot: "bg-brand-2" },
  info: { label: "FYI", dot: "bg-accent-text" },
} satisfies Record<Attention["tone"], { label: string; dot: string }>;

const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
const firstWord = (name: string) => name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] ?? name;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className="order-first font-display text-xl font-semibold break-words sm:text-2xl">{value}</dd>
      {note && <dd className="text-xs text-dim">{note}</dd>}
    </div>
  );
}

/** One card on the Home board. `area` says which Focus chips show it. */
function Card({ id, area, title, icon, href, cta, className = "", children }: { id: string; area: string; title: string; icon: ReactNode; href: string; cta: string; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-area={area} className={`animate-rise flex min-w-0 flex-col rounded-[1.75rem] border border-line bg-surface p-5 sm:p-6 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-dim">{icon}</span>
        <h2 id={id} className="min-w-0 flex-1 text-lg font-semibold">
          {title}
        </h2>
        <ArrowUpRight aria-hidden className="size-5 text-dim" />
      </div>
      <div className="mt-5 flex-1">{children}</div>
      <Link href={href} className="group mt-6 inline-flex items-center gap-2 self-start rounded-xl border border-line-strong px-4 py-2 text-sm font-medium hover:bg-surface-2">
        {cta}
        <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </section>
  );
}

/** Your own space: the day, your family, what needs doing, and money and career at a glance. */
export default async function HomePage() {
  const { now, household, investments, career, attention } = await getHomeData();
  const firstName = firstNameOf(career?.profile?.name);
  const k = household?.overview.kpis;
  const rate = household?.settings.defaultPkrPerAed;
  const chart = household?.overview.chart ?? [];
  const chartTotals = chart.map((m) => m.payrollAed + m.remittancesAed + m.expensesAed);
  const chartMax = Math.max(...chartTotals, 1);
  const top = career?.overview.matches[0];

  const summary = k
    ? `This month so far: ${formatAed(k.sentMonth.aed)} sent home, ${formatAed(k.spentMonth)} on the house, and ${k.payrollMonthPkr.gt(0) ? `${formatPkr(k.payrollMonthPkr)} paid to staff` : "payroll still to pay"}.`
    : "Your family, home, money and career, kept in one private place.";

  const members: PickerMember[] = (household?.family ?? []).map((m) => {
    const birthday = daysToBirthday(m.dateOfBirth, now);
    const notes = [
      ...(m.relationship !== "SELF" && birthday !== null && birthday <= 30 ? [birthday === 0 ? "Birthday today" : `Birthday in ${birthday} ${birthday === 1 ? "day" : "days"}`] : []),
      ...(household?.familyExpiries ?? []).filter((e) => e.memberId === m.id).map((e) => `${e.document[0]!.toUpperCase()}${e.document.slice(1)} ${whenText(e.daysLeft)}`),
      ...(m.passportExpiry ? [`Passport valid to ${shortDate.format(m.passportExpiry)}`] : []),
      ...(m.city ? [m.city] : []),
    ];
    return {
      id: m.id,
      name: m.fullName,
      firstName: m.relationship === "SELF" ? "You" : firstWord(m.fullName),
      relation: FAMILY_RELATIONSHIP_LABELS[m.relationship],
      age: ageOn(m.dateOfBirth, now),
      photoFileId: m.photoFileId,
      sendTo: household?.sendTo[m.id] ?? null,
      notes: [...new Set(notes)].slice(0, 4),
    };
  });
  // Your wife and children first; you last.
  members.sort((a, b) => Number(a.firstName === "You") - Number(b.firstName === "You"));

  return (
    <>
      <section aria-labelledby="hero-title" className="animate-rise pt-2">
        <p className="inline-flex max-w-full flex-wrap items-center gap-x-2 text-sm text-dim">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse" />
          <span>{dayFormat.format(now)}</span>
          <span aria-hidden>·</span>
          <span>{hijriFormat.format(now)}</span>
        </p>
        <h1 id="hero-title" className="mt-4 text-4xl leading-tight font-bold tracking-tight break-words sm:text-6xl">
          {greeting(now)}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-dim">{summary}</p>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-6">
          <nav aria-label="Quick actions" className="flex flex-wrap gap-3">
            <Link href="/household/remittances" className="bg-gradient-accent flex h-12 items-center gap-2 rounded-2xl px-6 text-sm font-semibold text-on-accent shadow-[0_10px_30px_-10px] shadow-[#ab8af5] hover:opacity-90">
              <Send aria-hidden className="size-4" /> Send home
            </Link>
            <Link href="/household/expenses" className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface-2/70 px-5 text-sm font-medium hover:border-line-strong">
              <Receipt aria-hidden className="size-4" /> Add an expense
            </Link>
            <Link href={household ? `/household/payroll/${household.month}` : "/household/payroll"} className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface-2/70 px-5 text-sm font-medium hover:border-line-strong">
              <Wallet aria-hidden className="size-4" /> Payroll
            </Link>
          </nav>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <LiveClocks start={now.toISOString()} />
            {rate && (
              <div className="col-span-2 rounded-2xl border border-line bg-surface px-4 py-3 sm:col-span-1">
                <dt className="text-xs tracking-wider text-dim uppercase">1 AED</dt>
                <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">Rs {rate.toFixed(2)}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      {household && (
        <section aria-labelledby="family-title" className="animate-rise mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="family-title" className="text-lg font-semibold">
              Pick family member
            </h2>
            <Link href="/household/family" className="text-sm text-dim hover:text-txt">
              Passports, CNICs and photos →
            </Link>
          </div>
          <div className="mt-4">
            <FamilyPicker members={members} />
          </div>
        </section>
      )}

      <FocusBoard>
        <section aria-labelledby="attention-title" className="animate-rise rounded-[1.75rem] border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden className="size-5 text-brand-2" />
            <h2 id="attention-title" className="text-lg font-semibold">
              Needs your attention
            </h2>
          </div>
          {attention.length ? (
            <ul className="mt-4 grid gap-2 md:grid-cols-2">
              {attention.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="group flex items-center gap-3 rounded-2xl border border-line bg-bg/60 px-4 py-3 hover:border-line-strong">
                    <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${TONE[item.tone].dot}`} />
                    <span className="w-10 shrink-0 font-mono text-xs text-dim uppercase">{TONE[item.tone].label}</span>
                    <span className="min-w-0 flex-1 break-words">{item.text}</span>
                    <ArrowRight aria-hidden className="size-4 shrink-0 text-dim transition-transform group-hover:translate-x-1" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-dim">
              <CircleCheck aria-hidden className="size-5 text-brand" /> All clear. Nothing is due right now.
            </p>
          )}
        </section>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Card id="home-money" area="money family" title="Money sent home" icon={<Send aria-hidden className="size-5" />} href="/household/remittances" cta="Send or see transfers">
            {k ? (
              <>
                <p className="font-display text-4xl font-semibold">{formatAed(k.sentMonth.aed)}</p>
                <p className="mt-1 text-sm text-dim">this month · {formatPkr(k.sentMonth.pkr)}</p>
                <dl className="mt-5 grid grid-cols-2 gap-4">
                  <Stat label="To your wife" value={formatAed(k.toWifeMonth.aed)} />
                  <Stat label="This year" value={formatAed(k.sentYtd.aed)} />
                </dl>
                {household.targets.length > 0 && (
                  <ul aria-label="Monthly targets" className="mt-5 grid gap-3">
                    {household.targets.slice(0, 3).map((t) => (
                      <li key={t.id} className="text-sm">
                        <span className="flex justify-between gap-2">
                          <span className="truncate">{t.name}</span>
                          <span className="shrink-0 text-dim">{t.share}%</span>
                        </span>
                        <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${t.share}%` }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-dim">Transfers to your family in Pakistan.</p>
            )}
          </Card>

          <Card id="home-family" area="household money" title="Household & Family" icon={<House aria-hidden className="size-5" />} href="/household" cta="Open Household & Family">
            {k ? (
              <>
                <p className="font-display text-4xl font-semibold">{formatAed(k.outflowMonth)}</p>
                <p className="mt-1 text-sm text-dim">going out this month</p>
                <dl className="mt-5 grid grid-cols-2 gap-4">
                  <Stat label="House expenses" value={formatAed(k.spentMonth)} />
                  <Stat
                    label="Staff payroll"
                    value={formatPkr(k.payrollMonthPkr)}
                    note={household.overview.monthRun ? { DRAFT: "In draft", APPROVED: "Approved", PAID: "Paid" }[household.overview.monthRun.status] : `Payday on the ${ordinal(household.settings.payrollDay)}`}
                  />
                  <Stat label="Advances owed" value={formatPkr(k.outstanding)} />
                  <Stat label="This year" value={formatAed(k.outflowYtd)} />
                </dl>
                <figure className="mt-6">
                  <figcaption className="text-xs text-dim">Going out each month, in AED</figcaption>
                  <ol className="mt-3 flex h-20 items-end gap-1.5">
                    {chart.map((m, i) => (
                      <li key={m.month} className="flex h-full flex-1 flex-col justify-end gap-1 text-center" title={`${shortMonth.format(new Date(`${m.month}-01T00:00:00Z`))}: ${formatAed(chartTotals[i]!)}`}>
                        <span className="sr-only">
                          {shortMonth.format(new Date(`${m.month}-01T00:00:00Z`))}: {formatAed(chartTotals[i]!)}
                        </span>
                        <span aria-hidden className={`w-full rounded-t-[4px] ${m.month === household.month ? "bg-chip" : "bg-surface-2"}`} style={{ height: `${Math.max((chartTotals[i]! / chartMax) * 100, 3)}%` }} />
                        <span aria-hidden className="font-mono text-[10px] text-dim">
                          {shortMonth.format(new Date(`${m.month}-01T00:00:00Z`))}
                        </span>
                      </li>
                    ))}
                  </ol>
                </figure>
              </>
            ) : (
              <p className="text-dim">Staff, payroll, money sent home and house expenses.</p>
            )}
          </Card>

          <Card id="home-investments" area="investments" title="Investments" icon={<TrendingUp aria-hidden className="size-5" />} href="/investments" cta={investments.state === "empty" ? "Add your first account" : "Open investments"}>
            {investments.state === "ready" ? (
              <dl className="grid gap-4">
                <Stat label="Portfolio value" value={aed(investments.total)} note={`${investments.positions} holdings · ${investments.accounts} ${investments.accounts === 1 ? "account" : "accounts"}`} />
                <div className="flex min-w-0 flex-col">
                  <dt className="text-sm text-dim">Unrealised gain</dt>
                  <dd className={`order-first font-display text-xl font-semibold ${tone(investments.unrealised)}`}>{signedAed(investments.unrealised)}</dd>
                </div>
                <Stat label="Dividends and interest" value={aed(investments.income)} />
              </dl>
            ) : (
              <p className="text-dim">
                {investments.state === "empty"
                  ? "Nothing tracked yet. Add your brokerage accounts and trades to see your portfolio grow here."
                  : "Your portfolio couldn't be valued just now. Open it to see the details."}
              </p>
            )}
          </Card>

          <Card id="home-career" area="career" title="Job search" icon={<BriefcaseBusiness aria-hidden className="size-5" />} href="/matches" cta="See job matches">
            {career ? (
              <>
                <dl className="grid grid-cols-2 gap-4">
                  <Stat label="New today" value={String(career.overview.newMatches)} />
                  <Stat label="Applied" value={String(career.overview.applied.length)} />
                </dl>
                {top && (
                  <p className="mt-4 rounded-2xl border border-line bg-bg/60 px-4 py-3 text-sm">
                    <span className="font-mono text-xs text-dim">Top match · {top.match!.score}</span>
                    <span className="block truncate font-medium">{top.title}</span>
                    <span className="block truncate text-dim">{top.company}</span>
                  </p>
                )}
                <ul aria-label="Job search pages" className="mt-4 flex flex-wrap gap-2">
                  {DASHBOARD_LINKS.filter((l) => l.href !== "/matches").map(({ href, label }) => (
                    <li key={href}>
                      <Link href={href} className="inline-block rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-txt hover:border-line-strong">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
                {career.overview.lastSearchAt && <p className="mt-3 text-xs text-dim">Last search {timeFormat.format(career.overview.lastSearchAt)}</p>}
              </>
            ) : (
              <p className="text-dim">Matches scored against your CV every morning.</p>
            )}
          </Card>

          {household && (household.familyExpiries.length > 0 || household.birthdays.length > 0) && (
            <Card id="home-dates" area="family" title="Family dates" icon={<Heart aria-hidden className="size-5" />} href="/household/family" cta="Open Family" className="md:col-span-2">
              <ul className="grid gap-2 sm:grid-cols-2">
                {household.birthdays.map((b) => (
                  <li key={`b-${b.memberId}`} className="flex items-center gap-3 rounded-2xl border border-line bg-bg/60 px-4 py-3 text-sm">
                    <Cake aria-hidden className="size-4 shrink-0 text-brand-2" />
                    <span className="min-w-0 flex-1">
                      {firstWord(b.name)}&rsquo;s birthday {b.days === 0 ? "is today" : `in ${b.days} ${b.days === 1 ? "day" : "days"}`}
                    </span>
                  </li>
                ))}
                {household.familyExpiries.slice(0, 6).map((e) => (
                  <li key={`${e.memberId}-${e.document}`} className="flex items-center gap-3 rounded-2xl border border-line bg-bg/60 px-4 py-3 text-sm">
                    <IdCard aria-hidden className="size-4 shrink-0 text-dim" />
                    <span className="min-w-0 flex-1">
                      {e.name} {e.document} {whenText(e.daysLeft)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </FocusBoard>
    </>
  );
}
