import { db } from "@/lib/db";

/** Your password hash: the one set from the Security page, or else the AUTH_PASSWORD_HASH setting. */
export async function currentPasswordHash(): Promise<string | null> {
  const row = await db().credential.findUnique({ where: { id: "owner" }, select: { passwordHash: true } });
  return row?.passwordHash ?? process.env.AUTH_PASSWORD_HASH ?? null;
}

export async function credentialInfo() {
  const row = await db().credential.findUnique({ where: { id: "owner" }, select: { updatedAt: true, sessionsValidFrom: true } });
  return { fromSecurityPage: Boolean(row), changedAt: row?.updatedAt ?? null, sessionsValidFrom: row?.sessionsValidFrom ?? null };
}

/** Saves a new password hash and signs out every session, this one included. */
export async function savePasswordHash(passwordHash: string, now = new Date()) {
  await db().credential.upsert({
    where: { id: "owner" },
    create: { id: "owner", passwordHash, sessionsValidFrom: now },
    update: { passwordHash, sessionsValidFrom: now },
  });
}

/** Ends every session, on every device. */
export async function signOutEverywhere(now = new Date()) {
  const hash = await currentPasswordHash();
  if (!hash) return;
  await db().credential.upsert({ where: { id: "owner" }, create: { id: "owner", passwordHash: hash, sessionsValidFrom: now }, update: { sessionsValidFrom: now } });
}

/**
 * Whether a session is still good: it must have started after the last password change or "sign
 * out everywhere". Sessions from before sign-in times were recorded count as old.
 */
export async function isSessionCurrent(signedInAt: number | null | undefined) {
  const row = await db().credential.findUnique({ where: { id: "owner" }, select: { sessionsValidFrom: true } });
  if (!row?.sessionsValidFrom) return true;
  return (signedInAt ?? 0) >= row.sessionsValidFrom.getTime();
}
