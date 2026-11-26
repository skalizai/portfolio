import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/household/audit";
import { aedFromPkr, D, type Dec, monthOf, monthRange, type Num, round2, sum } from "@/lib/household/money";
import { getHouseholdSettings } from "@/lib/household/settings";

/** Other household spending, in AED or PKR. Totals and budgets are in AED. */

type Fail = { ok: false; error: string; status: number };

const amount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter the amount, like 250")
  .refine((v) => Number(v) > 0, "The amount must be more than zero");
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());
const rate = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, "Enter the rate as rupees per dirham, like 76.25")
  .refine((v) => Number(v) > 0, "The rate must be above zero");

export const CURRENCIES = ["AED", "PKR"] as const;
export const EXPENSE_STATUS_LABELS = { PENDING: "To confirm", CONFIRMED: "Confirmed" } as const;

export const ExpenseInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date"),
  categoryId: z.string().min(1, "Choose a category"),
  amount,
  currency: z.enum(CURRENCIES).default("AED"),
  rate: optional(rate),
  paymentMethod: z.string().trim().max(60).default(""),
  notes: z.string().trim().max(500).default(""),
  status: z.enum(["PENDING", "CONFIRMED"]).default("CONFIRMED"),
});
export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;

export const CategoryInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60),
  monthlyBudgetAed: optional(z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter the budget in dirhams, like 1500")),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});
export type CategoryInput = z.infer<typeof CategoryInputSchema>;

export const RecurringInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name, like Rent").max(80),
  categoryId: z.string().min(1, "Choose a category"),
  amount,
  currency: z.enum(CURRENCIES).default("AED"),
  dayOfMonth: z.coerce.number().int().min(1, "Choose a day from 1 to 28").max(28, "Choose a day from 1 to 28"),
});
export type RecurringInput = z.infer<typeof RecurringInputSchema>;

/**
 * An amount in AED. A PKR amount is converted at the rate given (PKR per 1 AED), or the default
 * rate from Settings. The stored rate is AED per 1 unit of the currency.
 */
export function toAed(value: Num, currency: (typeof CURRENCIES)[number], pkrPerAed: Num): { amountAed: Dec; rateToAed: Dec } {
  if (currency === "AED") return { amountAed: round2(value), rateToAed: new D(1) };
  return { amountAed: aedFromPkr(value, pkrPerAed), rateToAed: new D(1).dividedBy(pkrPerAed).toDecimalPlaces(8, D.ROUND_HALF_UP) };
}

/** The rate a PKR expense was converted at, as PKR per 1 AED, for showing and editing. */
export const pkrPerAedOf = (rateToAed: Num) => (new D(rateToAed).gt(0) ? new D(1).dividedBy(rateToAed).toDecimalPlaces(4, D.ROUND_HALF_UP) : null);

// ---------- Categories ----------

export async function listCategories() {
  return db().expenseCategory.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }] });
}

const isDuplicate = (error: unknown) => (error as { code?: string })?.code === "P2002";

export async function createCategory(input: CategoryInput): Promise<{ ok: true; id: string } | Fail> {
  try {
    const last = await db().expenseCategory.aggregate({ _max: { sortOrder: true } });
    const category = await db().expenseCategory.create({ data: { name: input.name, monthlyBudgetAed: input.monthlyBudgetAed ? round2(input.monthlyBudgetAed) : null, isActive: input.isActive, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    await audit(db(), { entity: "ExpenseCategory", entityId: category.id, action: "create", after: category });
    return { ok: true, id: category.id };
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, error: "There's already a category with that name.", status: 409 };
    throw error;
  }
}

export async function updateCategory(id: string, input: CategoryInput): Promise<{ ok: true } | Fail> {
  const before = await db().expenseCategory.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "That category doesn't exist.", status: 404 };
  try {
    const after = await db().expenseCategory.update({ where: { id }, data: { name: input.name, monthlyBudgetAed: input.monthlyBudgetAed ? round2(input.monthlyBudgetAed) : null, isActive: input.isActive } });
    await audit(db(), { entity: "ExpenseCategory", entityId: id, action: "update", before, after });
    return { ok: true };
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, error: "There's already a category with that name.", status: 409 };
    throw error;
  }
}

// ---------- Expenses ----------

async function expenseData(input: ExpenseInput) {
  const settings = await getHouseholdSettings();
  const pkrPerAed = input.rate ?? settings.defaultPkrPerAed.toString();
  const { amountAed, rateToAed } = toAed(input.amount, input.currency, pkrPerAed);
  return {
    date: new Date(`${input.date}T00:00:00Z`),
    categoryId: input.categoryId,
    amount: round2(input.amount),
    currency: input.currency,
    rateToAed,
    amountAed,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    status: input.status,
  };
}

async function categoryExists(id: string) {
  return Boolean(await db().expenseCategory.findUnique({ where: { id }, select: { id: true } }));
}

export async function createExpense(input: ExpenseInput, receiptFileId?: string): Promise<{ ok: true; id: string } | Fail> {
  if (!(await categoryExists(input.categoryId))) return { ok: false, error: "That category doesn't exist.", status: 404 };
  const expense = await db().expense.create({ data: { ...(await expenseData(input)), receiptFileId: receiptFileId ?? null } });
  await audit(db(), { entity: "Expense", entityId: expense.id, action: "create", after: expense });
  return { ok: true, id: expense.id };
}

export async function updateExpense(id: string, input: ExpenseInput, receiptFileId?: string): Promise<{ ok: true } | Fail> {
  const before = await db().expense.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { ok: false, error: "That expense doesn't exist.", status: 404 };
  if (!(await categoryExists(input.categoryId))) return { ok: false, error: "That category doesn't exist.", status: 404 };
  const after = await db().expense.update({ where: { id }, data: { ...(await expenseData(input)), ...(receiptFileId ? { receiptFileId } : {}) } });
  await audit(db(), { entity: "Expense", entityId: id, action: "update", before, after });
  return { ok: true };
}

/** Marks a pending expense, such as one created from a recurring one, as confirmed. */
export async function confirmExpense(id: string): Promise<{ ok: true } | Fail> {
  const before = await db().expense.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { ok: false, error: "That expense doesn't exist.", status: 404 };
  const after = await db().expense.update({ where: { id }, data: { status: "CONFIRMED" } });
  await audit(db(), { entity: "Expense", entityId: id, action: "confirm", before, after });
  return { ok: true };
}

export async function removeExpense(id: string): Promise<{ ok: true } | Fail> {
  const before = await db().expense.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { ok: false, error: "That expense doesn't exist.", status: 404 };
  const after = await db().expense.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(db(), { entity: "Expense", entityId: id, action: "delete", before, after });
  return { ok: true };
}

export type ExpenseFilters = { month?: string; categoryId?: string; status?: string };

export async function listExpenses(filters: ExpenseFilters = {}) {
  const range = filters.month && /^\d{4}-\d{2}$/.test(filters.month) ? monthRange(filters.month) : null;
  return db().expense.findMany({
    where: {
      deletedAt: null,
      ...(range ? { date: { gte: range.start, lt: range.end } } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.status === "PENDING" || filters.status === "CONFIRMED" ? { status: filters.status } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { category: { select: { id: true, name: true } } },
  });
}

export type BudgetLine = { id: string; name: string; spent: Dec; budget: Dec | null; share: number | null; level: "ok" | "near" | "over" | "none" };

/** Each category's spending in a month against its budget. Pending expenses count, since they're due. */
export function budgetStatus(categories: { id: string; name: string; monthlyBudgetAed: Num | null; isActive: boolean }[], expenses: { categoryId: string; amountAed: Num }[]): BudgetLine[] {
  return categories
    .map((c) => {
      const spent = round2(sum(expenses.filter((e) => e.categoryId === c.id).map((e) => e.amountAed)));
      const budget = c.monthlyBudgetAed === null ? null : new D(c.monthlyBudgetAed);
      if (!budget || budget.lte(0)) return { id: c.id, name: c.name, spent, budget: null, share: null, level: "none" as const };
      const share = Number(spent.dividedBy(budget).times(100).toFixed(0));
      return { id: c.id, name: c.name, spent, budget, share, level: spent.gt(budget) ? ("over" as const) : share >= 80 ? ("near" as const) : ("ok" as const) };
    })
    .filter((line) => line.spent.gt(0) || (line.budget && categories.find((c) => c.id === line.id)?.isActive));
}

// ---------- Recurring ----------

export async function listRecurring() {
  return db().recurringExpense.findMany({ orderBy: [{ isActive: "desc" }, { dayOfMonth: "asc" }], include: { category: { select: { name: true } } } });
}

export async function createRecurring(input: RecurringInput): Promise<{ ok: true; id: string } | Fail> {
  if (!(await categoryExists(input.categoryId))) return { ok: false, error: "That category doesn't exist.", status: 404 };
  const recurring = await db().recurringExpense.create({ data: { ...input, amount: round2(input.amount) } });
  await audit(db(), { entity: "RecurringExpense", entityId: recurring.id, action: "create", after: recurring });
  return { ok: true, id: recurring.id };
}

export async function setRecurringActive(id: string, isActive: boolean): Promise<{ ok: true } | Fail> {
  const before = await db().recurringExpense.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "That recurring expense doesn't exist.", status: 404 };
  const after = await db().recurringExpense.update({ where: { id }, data: { isActive } });
  await audit(db(), { entity: "RecurringExpense", entityId: id, action: isActive ? "resume" : "pause", before, after });
  return { ok: true };
}

export async function removeRecurring(id: string): Promise<{ ok: true } | Fail> {
  const before = await db().recurringExpense.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "That recurring expense doesn't exist.", status: 404 };
  await db().recurringExpense.delete({ where: { id } });
  await audit(db(), { entity: "RecurringExpense", entityId: id, action: "delete", before });
  return { ok: true };
}

/**
 * Creates this month's expense, marked "to confirm", for each active recurring expense whose day
 * has come. Each one is created once a month: it's claimed first, so two runs at once can't both
 * create it. Runs from the daily cron, and when the Expenses page opens.
 */
export async function createDueRecurring(today = new Date()): Promise<number> {
  const month = monthOf(today);
  const due = await db().recurringExpense.findMany({ where: { isActive: true, OR: [{ lastCreatedMonth: null }, { lastCreatedMonth: { lt: month } }], dayOfMonth: { lte: today.getUTCDate() } } });
  if (!due.length) return 0;
  const settings = await getHouseholdSettings();
  let created = 0;
  for (const r of due) {
    const claimed = await db().recurringExpense.updateMany({ where: { id: r.id, OR: [{ lastCreatedMonth: null }, { lastCreatedMonth: { lt: month } }] }, data: { lastCreatedMonth: month } });
    if (claimed.count !== 1) continue;
    const currency = r.currency === "PKR" ? "PKR" : "AED";
    const { amountAed, rateToAed } = toAed(r.amount, currency, settings.defaultPkrPerAed);
    const expense = await db().expense.create({
      data: { date: new Date(`${month}-${String(r.dayOfMonth).padStart(2, "0")}T00:00:00Z`), categoryId: r.categoryId, amount: r.amount, currency, rateToAed, amountAed, notes: r.name, status: "PENDING", recurringId: r.id, isDemo: r.isDemo },
    });
    await audit(db(), { entity: "Expense", entityId: expense.id, action: "create-from-recurring", after: expense });
    created++;
  }
  return created;
}

