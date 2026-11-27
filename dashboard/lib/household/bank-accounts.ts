import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/household/audit";

/** Family members' bank accounts, and the channels money is sent through. */

type Fail = { ok: false; error: string; status: number };
const text = (max: number) => z.string().trim().max(max).default("");

export const BankAccountInputSchema = z.object({
  bankName: z.string().trim().min(1, "Enter the bank's name").max(80),
  accountTitle: text(120),
  branch: text(120),
  isPrimary: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(false),
});
export type BankAccountInput = z.infer<typeof BankAccountInputSchema>;

/** "Bank Alfalah · Gulberg", or the bank with the account title when there's no branch. */
export function accountLabel(account: { bankName: string; branch?: string; accountTitle?: string }) {
  const detail = account.branch || account.accountTitle;
  return detail ? `${account.bankName} · ${detail}` : account.bankName;
}

export async function listBankAccounts(familyMemberId: string) {
  return db().bankAccount.findMany({ where: { familyMemberId, deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
}

export async function addBankAccount(familyMemberId: string, input: BankAccountInput): Promise<{ ok: true; id: string } | Fail> {
  const member = await db().familyMember.findFirst({ where: { id: familyMemberId, deletedAt: null }, select: { id: true, isDemo: true } });
  if (!member) return { ok: false, error: "Family member not found.", status: 404 };
  return db().$transaction(async (tx) => {
    const count = await tx.bankAccount.count({ where: { familyMemberId, deletedAt: null } });
    // The first account is the main one; marking another as main moves it.
    const isPrimary = input.isPrimary || count === 0;
    if (isPrimary) await tx.bankAccount.updateMany({ where: { familyMemberId, deletedAt: null }, data: { isPrimary: false } });
    const account = await tx.bankAccount.create({ data: { ...input, isPrimary, familyMemberId, isDemo: member.isDemo } });
    await audit(tx, { entity: "BankAccount", entityId: account.id, action: "create", after: account });
    return { ok: true as const, id: account.id };
  });
}

/** Hides an account; transfers already sent to it keep showing which one. */
export async function removeBankAccount(id: string): Promise<{ ok: true } | Fail> {
  const before = await db().bankAccount.findFirst({ where: { id, deletedAt: null } });
  if (!before) return { ok: false, error: "That account doesn't exist.", status: 404 };
  await db().$transaction(async (tx) => {
    const after = await tx.bankAccount.update({ where: { id }, data: { deletedAt: new Date(), isPrimary: false } });
    if (before.isPrimary) {
      const next = await tx.bankAccount.findFirst({ where: { familyMemberId: before.familyMemberId, deletedAt: null }, orderBy: { createdAt: "asc" } });
      if (next) await tx.bankAccount.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await audit(tx, { entity: "BankAccount", entityId: id, action: "delete", before, after });
  });
  return { ok: true };
}

/** Each recipient's accounts, main one first, for the "To account" choice on a transfer. */
export async function accountsByRecipient(): Promise<Record<string, { id: string; label: string }[]>> {
  const recipients = await db().recipient.findMany({
    where: { deletedAt: null, familyMemberId: { not: null } },
    select: { id: true, familyMember: { select: { bankAccounts: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } } },
  });
  return Object.fromEntries(recipients.map((r) => [r.id, (r.familyMember?.bankAccounts ?? []).map((a) => ({ id: a.id, label: accountLabel(a) }))]));
}

// ---------- Channels ----------

export const ChannelInputSchema = z.object({ name: z.string().trim().min(1, "Enter the channel's name").max(80) });

export async function listChannels() {
  return db().transferChannel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

export async function addChannel(name: string): Promise<{ ok: true; id: string } | Fail> {
  const existing = await db().transferChannel.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) return { ok: false, error: `${existing.name} is already in the list.`, status: 409 };
  const last = await db().transferChannel.aggregate({ _max: { sortOrder: true } });
  const channel = await db().transferChannel.create({ data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  await audit(db(), { entity: "TransferChannel", entityId: channel.id, action: "create", after: channel });
  return { ok: true, id: channel.id };
}

/** Removes a channel from the list; transfers already recorded keep its name. */
export async function removeChannel(id: string): Promise<{ ok: true } | Fail> {
  const before = await db().transferChannel.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "That channel doesn't exist.", status: 404 };
  await db().transferChannel.delete({ where: { id } });
  await audit(db(), { entity: "TransferChannel", entityId: id, action: "delete", before });
  return { ok: true };
}
