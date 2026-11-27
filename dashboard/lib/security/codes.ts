import { createHash, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Six-digit codes emailed to you. Each lasts 10 minutes and allows 5 tries; asking for a new one
 * cancels the last. At most one a minute and five an hour, so a code can't be guessed by brute force.
 */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_TRIES = 5;
const GAP_MS = 60 * 1000;
const PER_HOUR = 5;

export type CodePurpose = "change-password" | "reset-password";
type Fail = { ok: false; error: string; status: number };

const hashCode = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");

export async function issueCode(purpose: CodePurpose, payload: Prisma.InputJsonValue | null = null, now = new Date()): Promise<{ ok: true; code: string; id: string } | Fail> {
  const recent = await db().verificationCode.findMany({ where: { purpose, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < GAP_MS) return { ok: false, error: "A code was sent less than a minute ago. Please check your email, or wait a moment and ask again.", status: 429 };
  if (recent.length >= PER_HOUR) return { ok: false, error: "Too many codes in the last hour. Please try again later.", status: 429 };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = await db().$transaction(async (tx) => {
    await tx.verificationCode.updateMany({ where: { purpose, usedAt: null }, data: { usedAt: now } });
    const row = await tx.verificationCode.create({ data: { purpose, codeHash: "pending", payload: payload ?? undefined, expiresAt: new Date(now.getTime() + CODE_TTL_MS), createdAt: now } });
    await tx.verificationCode.update({ where: { id: row.id }, data: { codeHash: hashCode(row.id, code) } });
    return row.id;
  });
  return { ok: true, code, id };
}

/** Takes back a code whose email couldn't be sent, so asking again isn't held up. */
export async function withdrawCode(id: string) {
  await db().verificationCode.deleteMany({ where: { id } });
}

/** Checks a code against the latest one sent. A right code can only be used once. */
export async function checkCode(purpose: CodePurpose, code: string, now = new Date()): Promise<{ ok: true; payload: Prisma.JsonValue | null } | Fail> {
  const clean = code.replace(/\s+/g, "");
  const row = await db().verificationCode.findFirst({ where: { purpose, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!row || row.expiresAt <= now || row.attempts >= CODE_TRIES) return { ok: false, error: "That code has expired. Please ask for a new one.", status: 400 };

  if (!/^\d{6}$/.test(clean) || hashCode(row.id, clean) !== row.codeHash) {
    const attempts = row.attempts + 1;
    await db().verificationCode.update({ where: { id: row.id }, data: { attempts } });
    const left = CODE_TRIES - attempts;
    return { ok: false, error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code isn't right, and it can't be used again. Please ask for a new one.", status: 400 };
  }
  // Only one request can claim it, even if two arrive at once.
  const claimed = await db().verificationCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (!claimed.count) return { ok: false, error: "That code has already been used. Please ask for a new one.", status: 400 };
  return { ok: true, payload: row.payload };
}
