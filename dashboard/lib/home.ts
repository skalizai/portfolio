import { budgetStatus, listCategories, listExpenses } from "@/lib/household/expenses";
import type { ExpiryAlert } from "@/lib/household/employees";
import { daysToBirthday, familyExpiries, listFamily, whenText, type FamilyExpiry } from "@/lib/household/family";
import { formatAed, monthOf, type Dec } from "@/lib/household/money";
import { getOverview } from "@/lib/household/overview";
import { listRecipients, listRemittances, targetProgress } from "@/lib/household/remittances";
import { getHouseholdSettings } from "@/lib/household/settings";
import { db } from "@/lib/db";
import { getPortfolio } from "@/lib/investments/service";
import { getJobsOverview } from "@/lib/jobs/overview";
import { getProfile } from "@/lib/profile/store";

export const HOME_TIME_ZONE = "Asia/Dubai";

/** The hour of the day in Dubai, 0–23. */
export function dubaiHour(now: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: HOME_TIME_ZONE }).format(now));
}

/** "Good morning" from 5am, "Good afternoon" from noon, "Good evening" from 5pm, in Dubai. */
export function greeting(now: Date) {
  const hour = dubaiHour(now);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Muhammad Sohail Khan Alizai" is greeted as Sohail. */
export function firstNameOf(fullName: string | null | undefined) {
  const names = fullName?.split(/\s+/).filter(Boolean) ?? [];
  return (/^(muhammad|mohammad|mohammed|muhammed|md\.?)$/i.test(names[0] ?? "") ? names[1] : names[0]) ?? null;
}

export type Attention = { key: string; tone: "urgent" | "soon" | "info"; text: string; href: string };

const monthName = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

/**
 * What needs doing, most pressing first: expired or expiring documents, this month's payroll once
 * payday is near, budgets passed, expenses waiting to be confirmed, family targets not yet met, and
 * cover letters ready to send.
 */
export function attentionItems(input: {
  today: Date;
  month: string;
  payrollDay: number;
  payrollStatus: "DRAFT" | "APPROVED" | "PAID" | null;
  staff: number;
  expiries: ExpiryAlert[];
  budgets: { name: string; level: "ok" | "near" | "over" | "none" }[];
  pendingExpenses: number;
  targets: { name: string; share: number; target: Dec; sent: Dec }[];
  coverLetters: number;
  familyExpiries?: FamilyExpiry[];
  birthdays?: { memberId: string; name: string; days: number }[];
}): Attention[] {
  const items: Attention[] = [];
  for (const b of input.birthdays ?? []) {
    items.push({ key: `birthday-${b.memberId}`, tone: b.days === 0 ? "urgent" : "info", text: b.days === 0 ? `It's ${b.name}'s birthday today` : `${b.name}'s birthday is in ${b.days} ${b.days === 1 ? "day" : "days"}`, href: `/household/family/${b.memberId}` });
  }
  for (const e of input.familyExpiries ?? []) {
    items.push({ key: `family-${e.memberId}-${e.document}`, tone: e.daysLeft <= 30 ? "urgent" : "soon", text: `${e.name} ${e.document} ${whenText(e.daysLeft)}`, href: `/household/family/${e.memberId}` });
  }
  for (const e of input.expiries.slice(0, 3)) {
    const when = e.daysLeft < 0 ? `expired ${-e.daysLeft} ${-e.daysLeft === 1 ? "day" : "days"} ago` : e.daysLeft === 0 ? "expires today" : `expires in ${e.daysLeft} ${e.daysLeft === 1 ? "day" : "days"}`;
    items.push({ key: `expiry-${e.employeeId}-${e.document}`, tone: e.daysLeft <= 7 ? "urgent" : "soon", text: `${e.employeeName}'s ${e.document} ${when}`, href: `/household/employees/${e.employeeId}` });
  }
  if (input.expiries.length > 3) items.push({ key: "expiry-more", tone: "soon", text: `${input.expiries.length - 3} more documents to renew`, href: "/household" });

  const day = Number(input.today.toISOString().slice(8, 10));
  if (input.staff > 0 && input.payrollStatus !== "PAID" && day >= input.payrollDay - 3) {
    const state = input.payrollStatus === "APPROVED" ? "is approved, not yet paid" : input.payrollStatus === "DRAFT" ? "is in draft" : "isn't prepared yet";
    items.push({ key: "payroll", tone: day >= input.payrollDay ? "urgent" : "soon", text: `${monthName(input.month)} payroll ${state}`, href: `/household/payroll/${input.month}` });
  }

  for (const b of input.budgets.filter((b) => b.level === "over")) items.push({ key: `budget-${b.name}`, tone: "soon", text: `${b.name} is over budget this month`, href: "/household/expenses" });
  if (input.pendingExpenses) items.push({ key: "pending", tone: "info", text: `${input.pendingExpenses} monthly ${input.pendingExpenses === 1 ? "expense" : "expenses"} to confirm`, href: "/household/expenses" });
  for (const t of input.targets.filter((t) => t.share < 100)) {
    items.push({ key: `target-${t.name}`, tone: "info", text: `${t.name}: ${formatAed(t.sent)} of ${formatAed(t.target)} sent this month`, href: "/household/remittances" });
  }
  if (input.coverLetters) items.push({ key: "letters", tone: "info", text: `${input.coverLetters} cover ${input.coverLetters === 1 ? "letter" : "letters"} ready to review`, href: "/applications" });

  const order = { urgent: 0, soon: 1, info: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** Gives up on a slow part (such as live exchange rates) so the page still opens quickly. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

async function investmentsSummary() {
  const count = await db().transaction.count();
  if (!count) return { state: "empty" as const };
  const view = await within(getPortfolio(), 4000);
  if (!view) return { state: "unavailable" as const };
  const t = view.portfolio.totals;
  return {
    state: "ready" as const,
    total: t.totalBase,
    unrealised: t.unrealisedBase,
    income: t.incomeBase,
    positions: view.portfolio.positions.length,
    accounts: view.accounts.length,
  };
}

async function householdSummary(today: Date) {
  const month = monthOf(today);
  const [overview, settings, categories, monthExpenses, recipients, monthTransfers, pendingExpenses, family] = await Promise.all([
    getOverview(month),
    getHouseholdSettings(),
    listCategories(),
    listExpenses({ month }),
    listRecipients(),
    listRemittances({ from: `${month}-01`, to: today.toISOString().slice(0, 10) }),
    db().expense.count({ where: { deletedAt: null, status: "PENDING" } }),
    listFamily(),
  ]);
  return {
    month,
    overview,
    settings,
    budgets: budgetStatus(categories, monthExpenses),
    targets: targetProgress(recipients, monthTransfers, month),
    pendingExpenses,
    family,
    // Which recipient to preselect when sending money to a family member.
    sendTo: Object.fromEntries(recipients.filter((r) => r.familyMemberId).map((r) => [r.familyMemberId!, r.id])) as Record<string, string>,
    familyExpiries: familyExpiries(family, settings.expiryAlertDays, today),
    birthdays: family
      .filter((m) => m.relationship !== "SELF")
      .map((m) => ({ memberId: m.id, name: m.fullName, days: daysToBirthday(m.dateOfBirth, today) }))
      .filter((b): b is { memberId: string; name: string; days: number } => b.days !== null && b.days <= 7),
  };
}

async function careerSummary() {
  const [overview, stored] = await Promise.all([getJobsOverview(), getProfile()]);
  const coverLetters = [...overview.matches, ...overview.sponsorshipUnknown, ...overview.below].filter((job) => job.application && !job.application.submitted).length;
  return { overview, profile: stored?.profile ?? null, coverLetters };
}

/** Everything the Home page shows. Each area loads on its own, so one failing leaves the rest. */
export async function getHomeData(now = new Date()) {
  const [household, investments, career] = await Promise.all([
    householdSummary(now).catch(() => null),
    investmentsSummary().catch(() => ({ state: "unavailable" as const })),
    careerSummary().catch(() => null),
  ]);

  const attention = household
    ? attentionItems({
        today: now,
        month: household.month,
        payrollDay: household.settings.payrollDay,
        payrollStatus: household.overview.monthRun?.status ?? null,
        staff: household.overview.staff,
        expiries: household.overview.expiries,
        budgets: household.budgets,
        pendingExpenses: household.pendingExpenses,
        targets: household.targets,
        coverLetters: career?.coverLetters ?? 0,
        familyExpiries: household.familyExpiries,
        birthdays: household.birthdays,
      })
    : [];

  return { now, household, investments, career, attention };
}

export type HomeData = Awaited<ReturnType<typeof getHomeData>>;
