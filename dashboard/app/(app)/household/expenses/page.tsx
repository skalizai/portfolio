import { Download, Paperclip, Pencil, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { CategoryForm, ConfirmExpense, ExpenseForm, RecurringForm, RecurringToggle } from "@/components/household/ExpenseForms";
import { RemoveButton } from "@/components/household/RemoveButton";
import { Button } from "@/components/ui/button";
import { budgetStatus, createDueRecurring, EXPENSE_STATUS_LABELS, listCategories, listExpenses, listRecurring } from "@/lib/household/expenses";
import { addMonths, formatAed, formatPkr, isMonth, monthOf, sum } from "@/lib/household/money";
import { getHouseholdSettings } from "@/lib/household/settings";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; categoryId?: string; status?: string }> }) {
  const params = await searchParams;
  const month = params.month && isMonth(params.month) ? params.month : monthOf(new Date());
  const categoryId = params.categoryId ?? "";
  const status = params.status ?? "";

  // This month's recurring expenses appear as soon as their day comes, even before the daily job runs.
  await createDueRecurring();
  const settings = await getHouseholdSettings();
  const categories = await listCategories();
  const recurring = await listRecurring();
  const monthExpenses = await listExpenses({ month });
  const expenses = categoryId || status ? await listExpenses({ month, categoryId, status }) : monthExpenses;
  const budgets = budgetStatus(categories, monthExpenses);
  const alerts = budgets.filter((b) => b.level === "over" || b.level === "near");
  const active = categories.filter((c) => c.isActive);
  const pending = monthExpenses.filter((e) => e.status === "PENDING").length;
  const query = new URLSearchParams(Object.entries({ month, categoryId, status }).filter(([, v]) => v)).toString();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Expenses</h1>
          <p className="mt-2 text-dim">Other household spending, in AED or PKR. Totals and budgets are in AED.</p>
        </div>
        <Button asChild variant="ghost" className="h-11 border border-line-strong">
          <a href={`/api/household/expenses/export?${query}`} download>
            <Download aria-hidden className="size-4" /> Export to Excel
          </a>
        </Button>
      </div>

      <nav aria-label="Month" className="mt-6 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="border border-line-strong">
          <Link href={`/household/expenses?month=${addMonths(month, -1)}`}>← {monthLabel(addMonths(month, -1))}</Link>
        </Button>
        <h2 className="px-2 text-lg font-semibold" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <Button asChild variant="ghost" size="sm" className="border border-line-strong">
          <Link href={`/household/expenses?month=${addMonths(month, 1)}`}>{monthLabel(addMonths(month, 1))} →</Link>
        </Button>
      </nav>

      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="flex flex-col rounded-[1.25rem] border border-line bg-surface p-4">
          <dt className="text-sm text-dim">Spent in {monthLabel(month)}</dt>
          <dd className="order-first font-mono text-lg font-semibold">{formatAed(sum(monthExpenses.map((e) => e.amountAed)))}</dd>
        </div>
        <div className="flex flex-col rounded-[1.25rem] border border-line bg-surface p-4">
          <dt className="text-sm text-dim">Expenses</dt>
          <dd className="order-first font-mono text-lg font-semibold">{monthExpenses.length}</dd>
        </div>
        <div className="flex flex-col rounded-[1.25rem] border border-line bg-surface p-4">
          <dt className="text-sm text-dim">To confirm</dt>
          <dd className="order-first font-mono text-lg font-semibold">{pending}</dd>
        </div>
      </dl>

      {alerts.length > 0 && (
        <section aria-labelledby="budget-alerts" className="mt-6 rounded-[1.5rem] border border-brand-2/60 bg-brand-2/10 p-5">
          <h2 id="budget-alerts" className="flex items-center gap-2 font-semibold">
            <TriangleAlert aria-hidden className="size-5 text-brand-2" />
            {alerts.length} {alerts.length === 1 ? "budget needs" : "budgets need"} attention
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.name}</span>: {a.level === "over" ? <strong>over budget</strong> : "nearly at budget"} · {formatAed(a.spent)} of {formatAed(a.budget!)} ({a.share}%)
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="new-expense" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="new-expense" className="text-lg font-semibold">
          Add an expense
        </h2>
        <div className="mt-4">
          <ExpenseForm
            categories={active.map((c) => ({ id: c.id, name: c.name }))}
            initial={{ date: today, categoryId: active[0]?.id ?? "", amount: "", currency: "AED", rate: settings.defaultPkrPerAed.toString(), paymentMethod: "", notes: "", status: "CONFIRMED" }}
          />
        </div>
      </section>

      {budgets.length > 0 && (
        <section aria-labelledby="by-category" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
          <h2 id="by-category" className="text-lg font-semibold">
            By category
          </h2>
          <ul className="mt-3 space-y-3 text-sm">
            {budgets.map((b) => (
              <li key={b.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    {b.name}
                    {b.level === "over" && <span className="font-semibold"> · over budget</span>}
                    {b.level === "near" && <span> · nearly at budget</span>}
                  </span>
                  <span className="font-mono">{b.budget ? `${formatAed(b.spent)} of ${formatAed(b.budget)}` : formatAed(b.spent)}</span>
                </div>
                {b.budget && (
                  <div className="mt-1 h-2 rounded-full bg-surface-2" role="progressbar" aria-label={`${b.name}: ${b.share}% of budget`} aria-valuenow={Math.min(100, b.share ?? 0)} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-2 rounded-full ${b.level === "over" ? "bg-loss" : b.level === "near" ? "bg-brand-2" : "bg-series-1"}`} style={{ width: `${Math.min(100, b.share ?? 0)}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form role="search" aria-label="Filter expenses" className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="month" value={month} />
        <label className="block text-sm">
          Category
          <select className={FIELD} name="categoryId" defaultValue={categoryId}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Status
          <select className={FIELD} name="status" defaultValue={status}>
            <option value="">Any status</option>
            <option value="PENDING">To confirm</option>
            <option value="CONFIRMED">Confirmed</option>
          </select>
        </label>
        <Button type="submit" variant="ghost" className="h-11 border border-line-strong">
          <Search aria-hidden className="size-4" /> Filter
        </Button>
      </form>

      {expenses.length ? (
        <ul className="mt-4 space-y-3">
          {expenses.map((e) => {
            const label = `${e.category.name} on ${dateFormat.format(e.date)}`;
            return (
              <li key={e.id} className="rounded-[1.25rem] border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">
                      {e.category.name} · <span className="font-mono">{e.currency === "PKR" ? formatPkr(e.amount) : formatAed(e.amount)}</span>
                      {e.currency === "PKR" && <span className="font-mono font-normal text-dim"> ≈ {formatAed(e.amountAed)}</span>}
                    </p>
                    <p className="text-sm text-dim">
                      {dateFormat.format(e.date)} · {e.status === "PENDING" ? <strong className="text-txt">{EXPENSE_STATUS_LABELS.PENDING}</strong> : EXPENSE_STATUS_LABELS.CONFIRMED}
                      {e.paymentMethod ? ` · ${e.paymentMethod}` : ""}
                      {e.recurringId ? " · monthly" : ""}
                    </p>
                    {e.notes && <p className="mt-1 text-sm break-words">{e.notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {e.status === "PENDING" && <ConfirmExpense id={e.id} label={label} />}
                    {e.receiptFileId && (
                      <Button asChild variant="ghost" size="sm" className="border border-line-strong">
                        <a href={`/api/household/files/${e.receiptFileId}`} target="_blank" rel="noreferrer">
                          <Paperclip aria-hidden className="size-4" /> Receipt <span className="sr-only">for {label}</span>
                        </a>
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="sm" className="border border-line-strong">
                      <Link href={`/household/expenses/${e.id}`}>
                        <Pencil aria-hidden className="size-4" /> Edit <span className="sr-only">{label}</span>
                      </Link>
                    </Button>
                    <RemoveButton path={`/api/household/expenses/${e.id}`} label={label} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-[1.5rem] border border-line bg-surface p-5 text-dim">{categoryId || status ? "No expenses match these filters." : `No expenses in ${monthLabel(month)}.`}</p>
      )}

      <section aria-labelledby="recurring" className="mt-8 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="recurring" className="text-lg font-semibold">
          Monthly expenses
        </h2>
        <p className="mt-1 text-sm text-dim">Rent, school fees and other fixed costs. Each month they&apos;re added on their day as “to confirm”, so you can check the amount.</p>
        {recurring.length > 0 && (
          <ul className="mt-3 divide-y divide-line text-sm">
            {recurring.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className={r.isActive ? "" : "text-dim"}>
                  {r.name} · {r.category.name} · <span className="font-mono">{r.currency === "PKR" ? formatPkr(r.amount) : formatAed(r.amount)}</span> · day {r.dayOfMonth}
                  {r.isActive ? "" : " · paused"}
                </span>
                <span className="flex gap-2">
                  <RecurringToggle id={r.id} isActive={r.isActive} label={r.name} />
                  <RemoveButton path={`/api/household/recurring/${r.id}`} label={r.name} question={`Stop ${r.name}? Expenses already added stay.`} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <RecurringForm categories={active.map((c) => ({ id: c.id, name: c.name }))} />
        </div>
      </section>

      <details className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <summary className="cursor-pointer text-lg font-semibold">Categories and budgets</summary>
        <p className="mt-2 text-sm text-dim">A monthly budget in AED is optional. You&apos;re alerted at 80% and when it&apos;s passed. A category no longer in use keeps its past expenses.</p>
        <ul className="mt-3 space-y-2">
          {categories.map((c) => (
            <li key={c.id}>
              <CategoryForm id={c.id} initial={{ name: c.name, monthlyBudgetAed: c.monthlyBudgetAed?.toString() ?? "", isActive: c.isActive }} />
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold">Add a category</h3>
        <div className="mt-2">
          <CategoryForm initial={{ name: "", monthlyBudgetAed: "", isActive: true }} />
        </div>
      </details>
    </>
  );
}
