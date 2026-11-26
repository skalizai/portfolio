import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/household/audit";
import { syncLinkedRecipients } from "@/lib/household/linked-recipients";

const money = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be an amount in rupees, like 35000`);
const optionalDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Enter a date")
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null));
const text = (max: number) => z.string().trim().max(max).default("");

export const STATUS_LABELS = { ACTIVE: "Active", ON_LEAVE: "On leave", LEFT: "Left" } as const;
export const PAYMENT_LABELS = { CASH: "Cash", BANK_TRANSFER: "Bank transfer" } as const;
export const DOCUMENT_LABELS = { CONTRACT: "Contract", CNIC: "CNIC copy", CANTT_PASS: "Cantt Pass copy", OTHER: "Other" } as const;

/** A CNIC is 13 digits. Accepted with or without dashes, and stored as 12345-1234567-1. */
const cnic = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ?? "").replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\d{13})?$/, "A CNIC has 13 digits, like 35202-1234567-1"))
  .transform((digits) => (digits ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : ""));

export const EmployeeInputSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter the full name").max(120),
    role: z.string().trim().min(1, "Enter the role, such as maid or driver").max(60),
    nationality: text(60),
    phone: text(40),
    cnicNo: cnic,
    cnicExpiry: optionalDate,
    canttPassNo: text(40),
    canttPassExpiry: optionalDate,
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
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER"]).default("CASH"),
    bankName: text(80),
    iban: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, "").toUpperCase())
      .pipe(z.string().regex(/^([A-Z]{2}\d{2}[A-Z0-9]{8,30})?$/, "That IBAN doesn't look right. A Pakistani IBAN starts with PK, like PK36SCBL…")),
    leaveDaysPerYear: z.coerce.number().int().min(0).max(60).default(30),
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
    ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { role: { contains: q, mode: "insensitive" } }, { nationality: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { cnicNo: { contains: q } }] } : {}),
  };
  return db().employee.findMany({ where, orderBy: [{ status: "asc" }, { fullName: "asc" }], include: { allowances: true, documents: true } });
}

export async function createEmployee(input: EmployeeInput) {
  const { allowances, ...fields } = input;
  return db().$transaction(async (tx) => {
    const employee = await tx.employee.create({ data: { ...fields, allowances: { create: allowances } }, include: { allowances: true } });
    await audit(tx, { entity: "Employee", entityId: employee.id, action: "create", after: employee });
    await syncLinkedRecipients(tx);
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
    await syncLinkedRecipients(tx);
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
    await syncLinkedRecipients(tx);
    return true;
  });
}

export type ExpiryAlert = { employeeId: string; employeeName: string; document: string; expiry: Date; daysLeft: number };

/**
 * CNICs, Cantt Passes, contracts and uploaded documents that have expired or expire within the
 * alert window, soonest first. Employees who have
 * left aren't included, since their documents no longer matter to you.
 */
export function expiryAlerts(
  employees: {
    id: string;
    fullName: string;
    status: string;
    cnicExpiry: Date | null;
    canttPassExpiry: Date | null;
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
      ["CNIC", e.cnicExpiry],
      ["Cantt Pass", e.canttPassExpiry],
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

