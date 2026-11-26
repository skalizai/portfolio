import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/household/audit";
import { syncLinkedRecipients } from "@/lib/household/linked-recipients";

/** You and your family: names, dates of birth and identity documents, with photos and copies. */

export const FAMILY_RELATIONSHIP_LABELS = {
  SELF: "Me",
  WIFE: "Wife",
  SON: "Son",
  DAUGHTER: "Daughter",
  MOTHER: "Mother",
  FATHER: "Father",
  BROTHER: "Brother",
  SISTER: "Sister",
  OTHER: "Other",
} as const;
export type FamilyRelationship = keyof typeof FAMILY_RELATIONSHIP_LABELS;

export const FAMILY_DOCUMENT_LABELS = {
  PASSPORT: "Passport",
  CNIC: "CNIC",
  B_FORM: "B-Form",
  EMIRATES_ID: "Emirates ID",
  VISA: "UAE visa",
  BIRTH_CERTIFICATE: "Birth certificate",
  NIKAH_NAMA: "Nikah nama",
  OTHER: "Other",
} as const;
export type FamilyDocumentType = keyof typeof FAMILY_DOCUMENT_LABELS;

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const optionalDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Enter a date")
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null));
const text = (max: number) => z.string().trim().max(max).default("");

/** A CNIC or B-Form number is 13 digits, stored as 12345-1234567-1. */
const cnic = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ?? "").replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\d{13})?$/, "A CNIC or B-Form number has 13 digits, like 35202-1234567-1"))
  .transform((digits) => (digits ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : ""));

/** Emirates ID: 15 digits, stored as 784-1990-1234567-1. */
const emiratesId = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ?? "").replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\d{15})?$/, "An Emirates ID has 15 digits, like 784-1990-1234567-1"))
  .transform((d) => (d ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 14)}-${d.slice(14)}` : ""));

export const FamilyMemberInputSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter the full name").max(120),
    relationship: z.enum(Object.keys(FAMILY_RELATIONSHIP_LABELS) as [FamilyRelationship, ...FamilyRelationship[]], { message: "Choose the relationship" }),
    dateOfBirth: optionalDate,
    phone: text(40),
    email: z.string().trim().max(120).email("That email doesn't look right").or(z.literal("")).default(""),
    city: text(80),
    bloodGroup: z.enum(["", ...BLOOD_GROUPS]).default(""),
    cnicNo: cnic,
    cnicExpiry: optionalDate,
    passportNo: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s+/g, "").toUpperCase())
      .pipe(z.string().regex(/^([A-Z0-9]{6,12})?$/, "A passport number is 6 to 12 letters and digits, like AB1234567"))
      .default(""),
    passportIssued: optionalDate,
    passportExpiry: optionalDate,
    emiratesIdNo: emiratesId,
    emiratesIdExpiry: optionalDate,
    visaExpiry: optionalDate,
    notes: text(2000),
  })
  .superRefine((input, ctx) => {
    if (input.passportIssued && input.passportExpiry && input.passportExpiry < input.passportIssued) {
      ctx.addIssue({ code: "custom", path: ["passportExpiry"], message: "The passport can't expire before it was issued" });
    }
    if (input.dateOfBirth && input.dateOfBirth > new Date()) {
      ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "The date of birth can't be in the future" });
    }
  });
export type FamilyMemberInput = z.infer<typeof FamilyMemberInputSchema>;

type Fail = { ok: false; error: string; status: number };

/** You first, then your wife, children by age, and the rest of the family. */
const ORDER: FamilyRelationship[] = ["SELF", "WIFE", "SON", "DAUGHTER", "MOTHER", "FATHER", "BROTHER", "SISTER", "OTHER"];

export async function listFamily() {
  const members = await db().familyMember.findMany({ where: { deletedAt: null }, include: { documents: true }, orderBy: [{ dateOfBirth: "asc" }, { createdAt: "asc" }] });
  const rank = (r: FamilyRelationship) => (r === "SON" || r === "DAUGHTER" ? ORDER.indexOf("SON") : ORDER.indexOf(r));
  return members.sort((a, b) => rank(a.relationship) - rank(b.relationship));
}

async function onlyOneSelf(relationship: FamilyRelationship, exceptId?: string) {
  if (relationship !== "SELF") return true;
  return !(await db().familyMember.count({ where: { relationship: "SELF", deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } }));
}

export async function createFamilyMember(input: FamilyMemberInput): Promise<{ ok: true; id: string } | Fail> {
  if (!(await onlyOneSelf(input.relationship))) return { ok: false, error: "You're already in the family list. Choose another relationship.", status: 409 };
  return db().$transaction(async (tx) => {
    const member = await tx.familyMember.create({ data: input });
    await audit(tx, { entity: "FamilyMember", entityId: member.id, action: "create", after: member });
    await syncLinkedRecipients(tx);
    return { ok: true as const, id: member.id };
  });
}

export async function updateFamilyMember(id: string, input: FamilyMemberInput): Promise<{ ok: true; id: string } | Fail> {
  if (!(await onlyOneSelf(input.relationship, id))) return { ok: false, error: "You're already in the family list. Choose another relationship.", status: 409 };
  return db().$transaction(async (tx) => {
    const before = await tx.familyMember.findFirst({ where: { id, deletedAt: null } });
    if (!before) return { ok: false as const, error: "That family member doesn't exist.", status: 404 };
    const after = await tx.familyMember.update({ where: { id }, data: input });
    await audit(tx, { entity: "FamilyMember", entityId: id, action: "update", before, after });
    await syncLinkedRecipients(tx);
    return { ok: true as const, id };
  });
}

/** Hides a family member. Money already sent to them stays in the totals. */
export async function removeFamilyMember(id: string): Promise<{ ok: true } | Fail> {
  return db().$transaction(async (tx) => {
    const before = await tx.familyMember.findFirst({ where: { id, deletedAt: null } });
    if (!before) return { ok: false as const, error: "That family member doesn't exist.", status: 404 };
    const after = await tx.familyMember.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { entity: "FamilyMember", entityId: id, action: "delete", before, after });
    await syncLinkedRecipients(tx);
    return { ok: true as const };
  });
}

/** Age in whole years on a given day, or null without a date of birth. */
export function ageOn(dateOfBirth: Date | null, today = new Date()) {
  if (!dateOfBirth) return null;
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday = today.getUTCMonth() < dateOfBirth.getUTCMonth() || (today.getUTCMonth() === dateOfBirth.getUTCMonth() && today.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

/** Days until the next birthday, 0 on the day itself. */
export function daysToBirthday(dateOfBirth: Date | null, today = new Date()) {
  if (!dateOfBirth) return null;
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const year = today.getUTCFullYear();
  // Someone born on 29 February has their birthday on 28 February in other years.
  const on = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = dateOfBirth.getUTCMonth() === 1 && dateOfBirth.getUTCDate() === 29 && !leap ? 28 : dateOfBirth.getUTCDate();
    return Date.UTC(y, dateOfBirth.getUTCMonth(), day);
  };
  const next = on(year) >= start ? on(year) : on(year + 1);
  return Math.round((next - start) / 86_400_000);
}

export type FamilyExpiry = { memberId: string; name: string; document: string; expiry: Date; daysLeft: number };

/**
 * Passports, CNICs, Emirates IDs, visas and uploaded documents that have expired or expire within
 * the alert window, soonest first. Passports are flagged six months ahead whatever the window is,
 * since many countries won't let you travel on less.
 */
export function familyExpiries(
  members: {
    id: string;
    fullName: string;
    relationship: string;
    cnicExpiry: Date | null;
    passportExpiry: Date | null;
    emiratesIdExpiry: Date | null;
    visaExpiry: Date | null;
    documents?: { type: FamilyDocumentType; expiry: Date | null }[];
  }[],
  windowDays: number,
  today = new Date(),
): FamilyExpiry[] {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const out: FamilyExpiry[] = [];
  for (const m of members) {
    const name = m.relationship === "SELF" ? "Your" : `${m.fullName}'s`;
    const dates: [string, Date | null, number][] = [
      ["passport", m.passportExpiry, Math.max(windowDays, 183)],
      ["CNIC", m.cnicExpiry, windowDays],
      ["Emirates ID", m.emiratesIdExpiry, windowDays],
      ["UAE visa", m.visaExpiry, windowDays],
      ...(m.documents ?? []).map((d) => [`${FAMILY_DOCUMENT_LABELS[d.type]} (file)`, d.expiry, windowDays] as [string, Date | null, number]),
    ];
    for (const [document, expiry, window] of dates) {
      if (!expiry) continue;
      const daysLeft = Math.round((expiry.getTime() - start) / 86_400_000);
      if (daysLeft <= window) out.push({ memberId: m.id, name, document, expiry, daysLeft });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** "expired 3 days ago", "expires today", "expires in 12 days". */
export function whenText(daysLeft: number) {
  if (daysLeft < 0) return `expired ${-daysLeft} ${daysLeft === -1 ? "day" : "days"} ago`;
  if (daysLeft === 0) return "expires today";
  return `expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
}
