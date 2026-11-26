import { ArrowRight, BriefcaseBusiness, CircleCheck, House, Receipt, Send, Sparkles, TrendingUp, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LiveClocks } from "@/components/LiveClocks";
import { Button } from "@/components/ui/button";
import { firstNameOf, getHomeData, greeting, HOME_TIME_ZONE, type Attention } from "@/lib/home";
import { formatPkr, type Num } from "@/lib/household/money";
import { aed, signedAed, tone } from "@/lib/investments/format";
import { DASHBOARD_LINKS } from "@/lib/nav";

const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: HOME_TIME_ZONE });
const hijriFormat = new Intl.DateTimeFormat("en-GB-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: HOME_TIME_ZONE });
const shortMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
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

function Chip({ title, detail, className }: { title: string; detail: string; className: string }) {
  return (
    <div className={`absolute max-w-[75%] rounded-2xl border border-line bg-surface/90 px-4 py-3 font-mono text-xs shadow-xl backdrop-blur ${className}`}>
      <p className="truncate font-semibold text-txt">{title}</p>
      <p className="mt-1 truncate text-dim">{detail}</p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className="order-first font-display text-xl font-semibold break-words sm:text-2xl">{value}</dd>
      {note && <dd className="text-xs text-dim">{note}</dd>}
    </div>
  );
}

/** One of the areas of life on the Home page: a heading with an icon, figures, and a way in. */
function Area({ id, eyebrow, title, icon, href, cta, className = "", children }: { id: string; eyebrow: string; title: string; icon: ReactNode; href: string; cta: string; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`animate-rise flex flex-col rounded-[2rem] border border-line bg-surface/70 p-5 sm:p-7 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="bg-gradient-accent flex size-11 shrink-0 items-center justify-center rounded-2xl text-on-accent">{icon}</span>
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-wider text-accent-text uppercase">{eyebrow}</p>
          <h2 id={id} className="text-xl font-semibold sm:text-2xl">
            {title}
          </h2>
        </div>
      </div>
      <div className="mt-5 flex-1">{children}</div>
      <Link href={href} className="group mt-6 inline-flex items-center gap-2 self-start rounded-full border border-line-strong px-4 py-2 text-sm font-medium hover:bg-surface-2">
        {cta}
        <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </section>
  );
}

/** Your own space: the day, what needs doing, and family, money and career at a glance. */
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

  return (
    <>
      <section aria-labelledby="hero-title" className="grid items-center gap-10 py-4 lg:grid-cols-[1.2fr_1fr] lg:py-10">
        <div className="animate-rise min-w-0">
          <p className="inline-flex max-w-full flex-wrap items-center gap-x-2 rounded-full border border-line bg-surface/60 px-4 py-1.5 font-mono text-xs tracking-wider text-dim">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse" />
            <span>{dayFormat.format(now)}</span>
            <span aria-hidden>·</span>
            <span>{hijriFormat.format(now)}</span>
          </p>
          <h1 id="hero-title" className="mt-6 text-4xl leading-tight font-semibold tracking-tight break-words sm:text-6xl">
            {greeting(now)}{firstName ? `, ${firstName}` : ""}.
            <span className="text-gradient-accent mt-2 block pb-1 text-3xl sm:text-5xl">Family, home and wealth, in one place.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-dim">{summary}</p>

          <nav aria-label="Quick actions" className="mt-7 flex flex-wrap gap-3">
            <Button asChild className="h-11 rounded-xl px-5">
              <Link href="/household/remittances">
                <Send aria-hidden className="size-4" /> Send home
              </Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 rounded-xl border border-line-strong px-5">
              <Link href="/household/expenses">
                <Receipt aria-hidden className="size-4" /> Add an expense
              </Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 rounded-xl border border-line-strong px-5">
              <Link href={household ? `/household/payroll/${household.month}` : "/household/payroll"}>
                <Wallet aria-hidden className="size-4" /> Payroll
              </Link>
            </Button>
          </nav>

          <dl className="mt-8 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
            <LiveClocks start={now.toISOString()} />
            {rate && (
              <div className="col-span-2 rounded-2xl border border-line bg-surface/70 px-4 py-3 sm:col-span-1">
                <dt className="text-xs tracking-wider text-dim uppercase">1 AED</dt>
                <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">Rs {rate.toFixed(2)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-sm px-6 py-10">
          <div aria-hidden className="bg-gradient-accent absolute inset-6 rounded-[2rem] opacity-30 blur-2xl motion-safe:animate-[drift_12s_ease-in-out_infinite]" />
          <div className="relative overflow-hidden rounded-[2rem] border border-line">
            {/* Served as is, because the image optimiser fetches without your sign-in and would be refused. */}
            <Image src="/profile.jpg" alt={career?.profile?.name ?? "Profile photo"} width={700} height={894} priority unoptimized className="h-auto w-full object-cover" />
          </div>
          {k && <Chip title={`Sent home · ${formatAed(k.sentYtd.aed)}`} detail={`This year, ${formatPkr(k.sentYtd.pkr)}`} className="top-2 -left-2" />}
          {household && (
            <Chip
              title={`${household.overview.staff} ${household.overview.staff === 1 ? "person" : "people"} on staff`}
              detail={`Payday on the ${ordinal(household.settings.payrollDay)}`}
              className="top-1/2 -right-3"
            />
          )}
          <Chip title="● Morning email" detail="9am UAE, every day" className="bottom-2 left-4" />
        </div>
      </section>

      <section aria-labelledby="attention-title" className="animate-rise mt-4 rounded-[2rem] border border-line bg-surface/70 p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden className="size-5 text-brand-2" />
          <h2 id="attention-title" className="text-xl font-semibold">
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

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Area id="home-family" eyebrow="This month" title="Household & Family" icon={<House aria-hidden className="size-5" />} href="/household" cta="Open Household & Family" className="lg:col-span-2 lg:row-span-2">
          {k ? (
            <>
              <p className="text-sm text-dim">Total going out this month</p>
              <p className="text-gradient-accent font-display text-4xl font-semibold sm:text-5xl">{formatAed(k.outflowMonth)}</p>
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                <Stat label="Sent home" value={formatAed(k.sentMonth.aed)} note={formatPkr(k.sentMonth.pkr)} />
                <Stat label="To your wife" value={formatAed(k.toWifeMonth.aed)} />
                <Stat label="House expenses" value={formatAed(k.spentMonth)} />
                <Stat label="Staff payroll" value={formatPkr(k.payrollMonthPkr)} note={household.overview.monthRun ? { DRAFT: "In draft", APPROVED: "Approved", PAID: "Paid" }[household.overview.monthRun.status] : "Not started"} />
                <Stat label="Advances owed to you" value={formatPkr(k.outstanding)} />
                <Stat label="This year" value={formatAed(k.outflowYtd)} note="Everything, since January" />
              </dl>
              <figure className="mt-7">
                <figcaption className="text-sm text-dim">Going out each month, in AED</figcaption>
                <ol className="mt-3 flex h-28 items-end gap-2">
                  {chart.map((m, i) => (
                    <li key={m.month} className="flex h-full flex-1 flex-col justify-end gap-1 text-center" title={`${shortMonth.format(new Date(`${m.month}-01T00:00:00Z`))}: ${formatAed(chartTotals[i]!)}`}>
                      <span className="sr-only">
                        {shortMonth.format(new Date(`${m.month}-01T00:00:00Z`))}: {formatAed(chartTotals[i]!)}
                      </span>
                      <span aria-hidden className={`w-full rounded-t-md ${m.month === household.month ? "bg-gradient-accent" : "bg-surface-2"}`} style={{ height: `${Math.max((chartTotals[i]! / chartMax) * 100, 3)}%` }} />
                      <span aria-hidden className="font-mono text-xs text-dim">
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
        </Area>

        <Area id="home-investments" eyebrow="Wealth" title="Investments" icon={<TrendingUp aria-hidden className="size-5" />} href="/investments" cta={investments.state === "empty" ? "Add your first account" : "Open investments"}>
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
        </Area>

        <Area id="home-career" eyebrow="Career" title="Job search" icon={<BriefcaseBusiness aria-hidden className="size-5" />} href="/matches" cta="See job matches">
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
                    <Link href={href} className="inline-block rounded-full bg-surface-2 px-3 py-1 text-xs text-dim hover:text-txt">
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
        </Area>
      </div>
    </>
  );
}
