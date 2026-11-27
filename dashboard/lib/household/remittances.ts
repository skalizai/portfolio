import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/household/audit";
import { achievedRate, D, type Dec, monthOf, type Num, pkrFromAed, round2, sum, ZERO } from "@/lib/household/money";

/** Money sent home: each transfer is in AED, with the rate and the PKR that arrived. */

export const RELATIONSHIP_LABELS = { WIFE: "Wife", CHILD: "Son or daughter", MOTHER: "Mother", FATHER: "Father", SIBLING: "Brother or sister", EMPLOYEE: "Staff", OTHER: "Other" } as const;
export const PURPOSE_LABELS = { HOUSEHOLD: "Household", SCHOOL_FEES: "School fees", MEDICAL: "Medical", CONSTRUCTION: "Construction", SAVINGS: "Savings", OTHER: "Other" } as const;
export type Purpose = keyof typeof PURPOSE_LABELS;

const money = (label: string, currency: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be an amount in ${currency}, like 1500`);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());
const text = (max: number) => z.string().trim().max(max).default("");

export const RecipientInputSchema = z.object({
  name: z.string().trim().min(1, "Enter the recipient's name").max(120),
  relationship: z.enum(["WIFE", "CHILD", "MOTHER", "FATHER", "SIBLING", "OTHER"]).default("OTHER"),
  phone: text(40),
  account: text(80),
  wallet: text(80),
  city: text(80),
  notes: text(500),
  monthlyTargetAed: optional(money("The monthly target", "dirhams")),
});
export type RecipientInput = z.infer<typeof RecipientInputSchema>;

export const RemittanceInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date"),
  recipientId: z.string().min(1, "Choose who it was sent to"),
  amountAed: money("The amount sent", "dirhams"),
  rate: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, "Enter the rate as rupees per dirham, like 76.25")
    .refine((v) => Number(v) > 0, "The rate must be above zero"),
  amountPkr: optional(money("The amount received", "rupees")),
  // Kept for older records and imports; the form no longer asks, as transfers have no fee.
  feeAed: optional(money("The fee", "dirhams")),
  channel: text(80),
  bankAccountId: optional(z.string().trim().max(40)),
  reference: text(120),
  purpose: z.enum(["HOUSEHOLD", "SCHOOL_FEES", "MEDICAL", "CONSTRUCTION", "SAVINGS", "OTHER"]).default("HOUSEHOLD"),
  notes: text(500),
});
export type RemittanceInput = z.infer<typeof RemittanceInputSchema>;

export const EMPTY_RECIPIENT = { name: "", relationship: "OTHER", phone: "", account: "", wallet: "", city: "", notes: "", monthlyTargetAed: "" };

type Fail = { ok: false; error: string; status: number };

/** A chosen account must belong to the family member the money went to. */
async function accountMatches(recipientId: string, bankAccountId?: string) {
  if (!bankAccountId) return true;
  return Boolean(await db().bankAccount.findFirst({ where: { id: bankAccountId, familyMember: { recipient: { id: recipientId } } }, select: { id: true } }));
}
const WRONG_ACCOUNT: Fail = { ok: false, error: "That bank account isn't one of the recipient's.", status: 400 };

function remittanceData(input: RemittanceInput) {
  if (new D(input.amountAed).lte(0)) return null;
  return {
    date: new Date(`${input.date}T00:00:00Z`),
    recipientId: input.recipientId,
    amountAed: round2(input.amountAed),
    rate: new D(input.rate),
    // PKR received is worked out from the rate unless you enter what actually arrived.
    amountPkr: input.amountPkr ? round2(input.amountPkr) : pkrFromAed(input.amountAed, input.rate),
    feeAed: round2(input.feeAed ?? "0"),
    channel: input.channel,
    bankAccountId: input.bankAccountId || null,
    reference: input.reference,
    purpose: input.purpose,
    notes: input.notes,
  };
}

// ---------- Recipients ----------

export type RecipientGroup = "family" | "staff" | "other";
export const groupOf = (r: { familyMemberId: string | null; employeeId: string | null }): RecipientGroup => (r.familyMemberId ? "family" : r.employeeId ? "staff" : "other");
const GROUP_ORDER: RecipientGroup[] = ["family", "staff", "other"];
const RELATION_ORDER = ["WIFE", "CHILD", "MOTHER", "FATHER", "SIBLING", "OTHER", "EMPLOYEE"];

/** Family first (your wife at the top), then staff, then anyone else, each in the order added. */
export async function listRecipients() {
  const rows = await db().recipient.findMany({ where: { deletedAt: null }, orderBy: [{ createdAt: "asc" }] });
  return rows.sort((a, b) => GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b)) || RELATION_ORDER.indexOf(a.relationship) - RELATION_ORDER.indexOf(b.relationship));
}

const recipientData = (input: RecipientInput) => ({ ...input, monthlyTargetAed: input.monthlyTargetAed ? round2(input.monthlyTargetAed) : null });

export async function createRecipient(input: RecipientInput) {
  const recipient = await db().recipient.create({ data: recipientData(input) });
  await audit(db(), { entity: "Recipient", entityId: recipient.id, action: "create", after: recipient });
  return recipient;
}

export async function updateRecipient(id: string, input: RecipientInput): Promise<{ ok: true } | Fail> {
  const before = await db().recipient.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { ok: false, error: "That recipient doesn't exist.", status: 404 };
  // Family and staff keep the name and relationship from their own record.
  const linked = before.familyMemberId || before.employeeId ? { name: before.name, relationship: before.relationship } : {};
  const after = await db().recipient.update({ where: { id }, data: { ...recipientData(input), ...linked } });
  await audit(db(), { entity: "Recipient", entityId: id, action: "update", before, after });
  return { ok: true };
}

/** Removes a recipient from the lists. Their past transfers stay in the totals. */
export async function removeRecipient(id: string): Promise<{ ok: true } | Fail> {
  const before = await db().recipient.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { ok: false, error: "That recipient doesn't exist.", status: 404 };
  if (before.familyMemberId) return { ok: false, error: `${before.name} is in your family list. Remove them there instead.`, status: 409 };
  if (before.employeeId) return { ok: false, error: `${before.name} is one of your staff. They're removed from here when they leave.`, status: 409 };
  const after = await db().recipient.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(db(), { entity: "Recipient", entityId: id, action: "delete", before, after });
  return { ok: true };
}

// ---------- Transfers ----------

export async function createRemittance(input: RemittanceInput, receiptFileId?: string): Promise<{ ok: true; id: string } | Fail> {
  const data = remittanceData(input);
  if (!data) return { ok: false, error: "The amount sent must be more than zero.", status: 400 };
  const recipient = await db().recipient.findFirst({ where: { id: input.recipientId, deletedAt: null }, select: { id: true } });
  if (!recipient) return { ok: false, error: "That recipient doesn't exist.", status: 404 };
  if (!(await accountMatches(input.recipientId, input.bankAccountId))) return WRONG_ACCOUNT;
  const remittance = await db().remittance.create({ data: { ...data, receiptFileId: receiptFileId ?? null } });
  await audit(db(), { entity: "Remittance", entityId: remittance.id, action: "create", after: remittance });
  return { ok: true, id: remittance.id };
}

export async function updateRemittance(id: string, input: RemittanceInput, receiptFileId?: string): Promise<{ ok: true } | Fail> {
  const before = await db().remittance.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { ok: false, error: "That transfer doesn't exist.", status: 404 };
  const data = remittanceData(input);
  if (!data) return { ok: false, error: "The amount sent must be more than zero.", status: 400 };
  const recipient = await db().recipient.findFirst({ where: { id: input.recipientId }, select: { id: true } });
  if (!recipient) return { ok: false, error: "That recipient doesn't exist.", status: 404 };
  if (!(await accountMatches(input.recipientId, input.bankAccountId))) return WRONG_ACCOUNT;
  const after = await db().remittance.update({ where: { id }, data: { ...data, ...(receiptFileId ? { receiptFileId } : {}) } });
  await audit(db(), { entity: "Remittance", entityId: id, action: "update", before, after });
  return { ok: true };
}

export async function removeRemittance(id: string): Promise<{ ok: true } | Fail> {
  const before = await db().remittance.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { ok: false, error: "That transfer doesn't exist.", status: 404 };
  const after = await db().remittance.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(db(), { entity: "Remittance", entityId: id, action: "delete", before, after });
  return { ok: true };
}

export type RemittanceFilters = { from?: string; to?: string; recipientId?: string; purpose?: string };

const isDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** Transfers, newest first, between two dates (both included) and for one recipient or purpose. */
export async function listRemittances(filters: RemittanceFilters = {}) {
  return db().remittance.findMany({
    where: {
      deletedAt: null,
      ...(isDate(filters.from) || isDate(filters.to)
        ? { date: { ...(isDate(filters.from) ? { gte: new Date(`${filters.from}T00:00:00Z`) } : {}), ...(isDate(filters.to) ? { lte: new Date(`${filters.to}T00:00:00Z`) } : {}) } }
        : {}),
      ...(filters.recipientId ? { recipientId: filters.recipientId } : {}),
      ...(filters.purpose && filters.purpose in PURPOSE_LABELS ? { purpose: filters.purpose as Purpose } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { recipient: { select: { id: true, name: true } }, bankAccount: { select: { bankName: true, branch: true, accountTitle: true } } },
  });
}

type Row = { date: Date; amountAed: Num; amountPkr: Num; feeAed: Num; purpose: Purpose; recipient: { id: string; name: string } };
type Totals = { aed: Dec; pkr: Dec; fees: Dec; count: number };
const empty = (): Totals => ({ aed: ZERO, pkr: ZERO, fees: ZERO, count: 0 });
const add = (t: Totals, r: Row): Totals => ({ aed: t.aed.plus(r.amountAed), pkr: t.pkr.plus(r.amountPkr), fees: t.fees.plus(r.feeAed), count: t.count + 1 });

/**
 * Totals for a set of transfers: sent in AED, received in PKR, fees, and the average rate, which is
 * all the PKR received over all the AED sent (so bigger transfers count for more).
 */
export function summarizeRemittances(rows: Row[]) {
  const total = rows.reduce(add, empty());
  const group = (key: (r: Row) => string) => {
    const map = new Map<string, Totals>();
    for (const r of rows) map.set(key(r), add(map.get(key(r)) ?? empty(), r));
    return [...map.entries()].map(([k, t]) => ({ key: k, ...t })).sort((a, b) => b.aed.comparedTo(a.aed));
  };
  const names = new Map(rows.map((r) => [r.recipient.id, r.recipient.name]));
  return {
    ...total,
    averageRate: achievedRate(total.aed, total.pkr),
    byRecipient: group((r) => r.recipient.id).map((g) => ({ ...g, name: names.get(g.key) ?? "" })),
    byPurpose: group((r) => r.purpose).map((g) => ({ ...g, name: PURPOSE_LABELS[g.key as Purpose] })),
    byMonth: group((r) => monthOf(r.date)).sort((a, b) => b.key.localeCompare(a.key)),
  };
}

/** How much of each recipient's monthly target has been sent this month, in AED. */
export function targetProgress(recipients: { id: string; name: string; monthlyTargetAed: Num | null }[], rows: Row[], month: string) {
  return recipients
    .filter((r) => r.monthlyTargetAed !== null && new D(r.monthlyTargetAed).gt(0))
    .map((r) => {
      const target = new D(r.monthlyTargetAed!);
      const sent = sum(rows.filter((row) => row.recipient.id === r.id && monthOf(row.date) === month).map((row) => row.amountAed));
      return { id: r.id, name: r.name, target, sent, share: Math.min(100, Number(sent.dividedBy(target).times(100).toFixed(0))) };
    });
}
