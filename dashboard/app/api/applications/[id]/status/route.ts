import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

const BodySchema = z
  .object({
    status: z.enum(["SUBMITTED", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"]).optional(),
    notes: z.string().max(5000).optional(),
  })
  .refine((body) => body.status !== undefined || body.notes !== undefined, "Nothing to update.");

/** Moves an application along the board, or saves your notes on it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });

  const { id } = await params;
  const { status, notes } = body.data;
  const application = await db().application.findUnique({ where: { id }, select: { status: true, submittedAt: true, sendAt: true, history: true, jobId: true } });
  if (!application) return Response.json({ error: "Application not found." }, { status: 404 });

  if (status) {
    if (application.sendAt) return Response.json({ error: "This is waiting to send. Cancel it first." }, { status: 409 });
    // Only a draft you've decided against can skip being applied for.
    if (!application.submittedAt && status !== "WITHDRAWN") {
      return Response.json({ error: "Mark this as applied first." }, { status: 409 });
    }
  }

  const changed = status && status !== application.status;
  await db().application.update({
    where: { id },
    data: {
      status,
      notes,
      ...(changed
        ? { history: [...(application.history as Prisma.JsonArray), { at: new Date().toISOString(), action: "status", from: application.status, to: status }] as Prisma.InputJsonValue }
        : {}),
    },
  });
  if (changed) await db().auditLog.create({ data: { action: "application.status", applicationId: id, jobId: application.jobId, payload: { from: application.status, to: status } } });
  return Response.json({ status: status ?? application.status });
}
