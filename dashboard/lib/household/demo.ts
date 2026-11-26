import { db } from "@/lib/db";
import { createAdvance } from "@/lib/household/advances";
import { audit } from "@/lib/household/audit";
import { toAed } from "@/lib/household/expenses";
import { addMonths, monthOf, pkrFromAed } from "@/lib/household/money";
import { approveRun, payRun, prepareRun } from "@/lib/household/payroll";
import { getHouseholdSettings } from "@/lib/household/settings";

/**
 * Sample data to try the section with: two staff, an advance, two paid payroll months, three
 * transfers home and a few expenses. Everything is marked as demo, so "Clear demo data" removes
 * exactly this and nothing of yours. The two payroll months are the two before this one; a month
 * that already has your own payroll is left alone.
 */
export async function loadDemoData(today = new Date()): Promise<{ ok: true; skippedMonths: string[] } | { ok: false; error: string; status: number }> {
  if (await db().employee.count({ where: { isDemo: true } })) return { ok: false, error: "The demo data is already loaded.", status: 409 };

  const settings = await getHouseholdSettings();
  const rate = settings.defaultPkrPerAed;
  const thisMonth = monthOf(today);
  const [first, second] = [addMonths(thisMonth, -2), addMonths(thisMonth, -1)];
  const day = (month: string, d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const date = (month: string, d: number) => new Date(`${day(month, d)}T00:00:00Z`);

  const shazia = await db().employee.create({
    data: { fullName: "Shazia Bibi (demo)", role: "Housemaid", nationality: "Pakistani", phone: "+92 300 0000000", joiningDate: date(addMonths(thisMonth, -14), 1), basicSalary: "35000", paymentMethod: "CASH", isDemo: true, allowances: { create: [{ name: "Food", amount: "3000" }] } },
  });
  const aslam = await db().employee.create({
    data: { fullName: "Aslam Khan (demo)", role: "Driver", nationality: "Pakistani", phone: "+92 301 0000000", joiningDate: date(addMonths(thisMonth, -30), 1), basicSalary: "45000", paymentMethod: "BANK_TRANSFER", bankName: "Meezan Bank", isDemo: true, allowances: { create: [{ name: "Fuel", amount: "5000" }] } },
  });

  const advance = await createAdvance({ employeeId: aslam.id, date: day(first, 1), amount: "20000", reason: "Medical (demo)", plan: "FIXED_MONTHLY", perMonth: "5000", startMonth: first });
  if (advance.ok) await db().advance.update({ where: { id: advance.id }, data: { isDemo: true } });

  const skippedMonths: string[] = [];
  for (const month of [first, second]) {
    const run = await prepareRun(month, { demo: true });
    if (!run.ok) {
      skippedMonths.push(month);
      continue;
    }
    await approveRun(run.id);
    await payRun(run.id, { paidAt: day(month, 28), method: "Cash", reference: "" });
  }

  const mother = await db().recipient.create({ data: { name: "Mother (demo)", relationship: "MOTHER", city: "Peshawar", monthlyTargetAed: "500", isDemo: true } });
  const wife = await db().recipient.findFirst({ where: { relationship: "WIFE", deletedAt: null } });
  const transfers = [
    { month: first, d: 2, recipientId: wife?.id ?? mother.id, aed: "2500", rate: rate.plus("0.4"), fee: "15", purpose: "HOUSEHOLD" as const, channel: "Al Ansari" },
    { month: second, d: 3, recipientId: mother.id, aed: "800", rate: rate.plus("0.2"), fee: "10", purpose: "MEDICAL" as const, channel: "Bank app" },
    { month: thisMonth, d: 1, recipientId: wife?.id ?? mother.id, aed: "2500", rate, fee: "15", purpose: "SCHOOL_FEES" as const, channel: "Al Ansari" },
  ];
  for (const t of transfers) {
    await db().remittance.create({
      data: { date: date(t.month, t.d), recipientId: t.recipientId, amountAed: t.aed, rate: t.rate, amountPkr: pkrFromAed(t.aed, t.rate), feeAed: t.fee, channel: t.channel, purpose: t.purpose, notes: "Demo transfer", isDemo: true },
    });
  }

  const expenses = [
    { month: second, d: 5, categoryId: "cat-groceries", amount: "850", currency: "AED" as const },
    { month: second, d: 12, categoryId: "cat-utilities", amount: "620", currency: "AED" as const },
    { month: second, d: 20, categoryId: "cat-medical", amount: "15000", currency: "PKR" as const },
    { month: thisMonth, d: 1, categoryId: "cat-groceries", amount: "400", currency: "AED" as const },
  ];
  for (const e of expenses) {
    const { amountAed, rateToAed } = toAed(e.amount, e.currency, rate);
    await db().expense.create({ data: { date: date(e.month, e.d), categoryId: e.categoryId, amount: e.amount, currency: e.currency, rateToAed, amountAed, paymentMethod: "Card", notes: "Demo expense", isDemo: true } });
  }
  await db().recurringExpense.create({ data: { name: "Internet (demo)", categoryId: "cat-utilities", amount: "389", currency: "AED", dayOfMonth: 1, isDemo: true, lastCreatedMonth: thisMonth } });

  await audit(db(), { entity: "Demo", entityId: "demo", action: "load", after: { employees: [shazia.id, aslam.id], skippedMonths } });
  return { ok: true, skippedMonths };
}

/** Removes everything "Load demo data" added, and nothing else. */
export async function clearDemoData(): Promise<{ removed: number }> {
  return db().$transaction(async (tx) => {
    const employees = (await tx.employee.findMany({ where: { isDemo: true }, select: { id: true } })).map((e) => e.id);
    let removed = 0;
    removed += (await tx.payslip.deleteMany({ where: { OR: [{ run: { isDemo: true } }, { employeeId: { in: employees } }] } })).count;
    removed += (await tx.payrollLine.deleteMany({ where: { OR: [{ run: { isDemo: true } }, { employeeId: { in: employees } }] } })).count;
    removed += (await tx.payrollRun.deleteMany({ where: { isDemo: true } })).count;
    removed += (await tx.advance.deleteMany({ where: { OR: [{ isDemo: true }, { employeeId: { in: employees } }] } })).count;
    removed += (await tx.employee.deleteMany({ where: { isDemo: true } })).count;
    removed += (await tx.remittance.deleteMany({ where: { OR: [{ isDemo: true }, { recipient: { isDemo: true } }] } })).count;
    removed += (await tx.recipient.deleteMany({ where: { isDemo: true } })).count;
    removed += (await tx.expense.deleteMany({ where: { isDemo: true } })).count;
    removed += (await tx.recurringExpense.deleteMany({ where: { isDemo: true } })).count;
    removed += (await tx.storedFile.deleteMany({ where: { isDemo: true } })).count;
    await audit(tx, { entity: "Demo", entityId: "demo", action: "clear", after: { removed } });
    return { removed };
  });
}

export const hasDemoData = async () => (await db().employee.count({ where: { isDemo: true } })) > 0 || (await db().remittance.count({ where: { isDemo: true } })) > 0;
