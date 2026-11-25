import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/household/audit";
import { D, type Dec, type Num, round2 } from "@/lib/household/money";

const money = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be an amount, like 1500 or 1500.50`);
const optionalDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Enter a date")
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null));
const text = (max: number) => z.string().trim().max(max).default("");

export const STATUS_LABELS = { ACTIVE: "Active", ON_LEAVE: "On leave", LEFT: "Left" } as const;
export const PAYMENT_LABELS = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", WPS: "WPS", EXCHANGE_HOUSE: "Exchange house" } as const;
export const DOCUMENT_LABELS = { CONTRACT: "Contract", PASSPORT: "Passport copy", EMIRATES_ID: "Emirates ID copy", VISA: "Visa or permit", INSURANCE: "Medical insurance", OTHER: "Other" } as const;

export const EmployeeInputSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter the full name").max(120),
    role: z.string().trim().min(1, "Enter the role, such as maid or driver").max(60),
    nationality: text(60),
    phone: text(40),
    homeContact: text(200),
    passportNo: text(40),
    passportExpiry: optionalDate,
    emiratesIdNo: text(40),
    emiratesIdExpiry: optionalDate,
    visaExpiry: optionalDate,
    contractNo: text(60),
    insuranceExpiry: optionalDate,
    joiningDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the joining date")
      .transform((value) => new Date(`${value}T00:00:00Z`)),
    contractStart: optionalDate,
    contractEnd: optionalDate,
    status: z.enum(["ACTIVE", "ON_LEAVE", "LEFT"]).default("ACTIVE"),
    basicSalary: money("The basic salary"),
    allowances: z
      .array(z.object({ name: z.string().trim().min(1, "Name each allowance").max(60), amount: money("Each allowance") }))
      .max(10, "Up to 10 allowances")
      .default([]),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "WPS", "EXCHANGE_HOUSE"]).default("CASH"),
    bankName: text(80),
    iban: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, "").toUpperCase())
      .pipe(z.string().regex(/^([A-Z]{2}\d{2}[A-Z0-9]{8,30})?$/, "That IBAN doesn't look right. It starts with two letters, like AE07…")),
    leaveDaysPerYear: z.coerce.number().int().min(0).max(60).default(30),
    airTicket: z.boolean().default(false),
    airTicketAmount: z
      .string()
      .trim()
      .regex(/^(\d+(\.\d{1,2})?)?$/, "The ticket amount must be an amount")
      .optional()
      .transform((value) => (value ? value : null)),
    notes: text(2000),
  })
  .superRefine((input, ctx) => {
    if (input.contractStart && input.contractEnd && input.contractEnd < input.contractStart) {
      ctx.addIssue({ code: "custom", path: ["contractEnd"], message: "The contract can't end before it starts" });
    }
  });

export type EmployeeInput = z.infer<typeof EmployeeInputSchema>;

/** Employees you haven't removed, optionally searched and filtered by status. */
export async function listEmployees(filters: { q?: string; status?: string } = {}) {
  const q = filters.q?.trim();
  const where: Prisma.EmployeeWhereInput = {
    deletedAt: null,
    ...(filters.status && ["ACTIVE", "ON_LEAVE", "LEFT"].includes(filters.status) ? { status: filters.status as "ACTIVE" | "ON_LEAVE" | "LEFT" } : {}),
    ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { role: { contains: q, mode: "insensitive" } }, { nationality: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
  };
  return db().employee.findMany({ where, orderBy: [{ status: "asc" }, { fullName: "asc" }], include: { allowances: true, documents: true } });
}

export async function createEmployee(input: EmployeeInput) {
  const { allowances, ...fields } = input;
  return db().$transaction(async (tx) => {
    const employee = await tx.employee.create({ data: { ...fields, allowances: { create: allowances } }, include: { allowances: true } });
    await audit(tx, { entity: "Employee", entityId: employee.id, action: "create", after: employee });
    return employee;
  });
}

export async function updateEmployee(id: string, input: EmployeeInput) {
  const { allowances, ...fields } = input;
  return db().$transaction(async (tx) => {
    const before = await tx.employee.findFirst({ where: { id, deletedAt: null }, include: { allowances: true } });
    if (!before) return null;
    await tx.employeeAllowance.deleteMany({ where: { employeeId: id } });
    const after = await tx.employee.update({ where: { id }, data: { ...fields, allowances: { create: allowances } }, include: { allowances: true } });
    await audit(tx, { entity: "Employee", entityId: id, action: "update", before, after });
    return after;
  });
}

/** Removes an employee from the lists but keeps them, so payroll history and payslips stay intact. */
export async function removeEmployee(id: string) {
  return db().$transaction(async (tx) => {
    const before = await tx.employee.findFirst({ where: { id, deletedAt: null } });
    if (!before) return false;
    const after = await tx.employee.update({ where: { id }, data: { deletedAt: new Date(), status: "LEFT" } });
    await audit(tx, { entity: "Employee", entityId: id, action: "delete", before, after });
    return true;
  });
}

export type ExpiryAlert = { employeeId: string; employeeName: string; document: string; expiry: Date; daysLeft: number };

/**
 * Documents that have expired or expire within the alert window, soonest first. Employees who have
 * left aren't included, since their documents no longer matter to you.
 */
export function expiryAlerts(
  employees: {
    id: string;
    fullName: string;
    status: string;
    passportExpiry: Date | null;
    emiratesIdExpiry: Date | null;
    visaExpiry: Date | null;
    insuranceExpiry: Date | null;
    contractEnd: Date | null;
    documents?: { type: keyof typeof DOCUMENT_LABELS; expiry: Date | null }[];
  }[],
  windowDays: number,
  today = new Date(),
): ExpiryAlert[] {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const alerts: ExpiryAlert[] = [];
  for (const e of employees) {
    if (e.status === "LEFT") continue;
    const dates: [string, Date | null][] = [
      ["Passport", e.passportExpiry],
      ["Emirates ID", e.emiratesIdExpiry],
      ["Visa or permit", e.visaExpiry],
      ["Medical insurance", e.insuranceExpiry],
      ["Contract", e.contractEnd],
      ...(e.documents ?? []).map((d) => [`${DOCUMENT_LABELS[d.type]} (file)`, d.expiry] as [string, Date | null]),
    ];
    for (const [document, expiry] of dates) {
      if (!expiry) continue;
      const daysLeft = Math.round((expiry.getTime() - start) / 86_400_000);
      if (daysLeft <= windowDays) alerts.push({ employeeId: e.id, employeeName: e.fullName, document, expiry, daysLeft });
    }
  }
  return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * An estimate of end-of-service gratuity: the configured days of basic pay (basic ÷ 30 a day) for
 * each completed year of service. Only an estimate; the real amount depends on the contract and law.
 */
export function estimatedGratuity(basicSalary: Num, joiningDate: Date, daysPerYear: Num, asOf = new Date()): { years: number; amount: Dec } {
  let years = asOf.getUTCFullYear() - joiningDate.getUTCFullYear();
  const anniversaryPassed =
    asOf.getUTCMonth() > joiningDate.getUTCMonth() || (asOf.getUTCMonth() === joiningDate.getUTCMonth() && asOf.getUTCDate() >= joiningDate.getUTCDate());
  if (!anniversaryPassed) years -= 1;
  years = Math.max(0, years);
  return { years, amount: round2(new D(basicSalary).dividedBy(30).times(daysPerYear).times(years)) };
}
