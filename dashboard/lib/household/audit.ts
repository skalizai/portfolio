import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";

type Client = Pick<ReturnType<typeof db>, "householdAuditLog">;

/** Turns a row into plain JSON: Decimals as strings, dates as ISO, file bytes left out. */
export function toAuditJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v instanceof Prisma.Decimal) return v.toString();
      if (v instanceof Uint8Array || (v && typeof v === "object" && v.type === "Buffer")) return undefined;
      return v;
    }),
  );
}

/**
 * Records a change to payroll, advances, remittances or another household record: what it was,
 * what it became, and when. Pass the transaction client so the entry commits with the change.
 */
export async function audit(client: Client, entry: { entity: string; entityId: string; action: string; before?: unknown; after?: unknown }) {
  await client.householdAuditLog.create({
    data: { entity: entry.entity, entityId: entry.entityId, action: entry.action, before: toAuditJson(entry.before), after: toAuditJson(entry.after) },
  });
}
