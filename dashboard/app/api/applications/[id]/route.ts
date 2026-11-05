import { z } from "zod";
import { TailoredCvSchema } from "@/lib/apply/cvSchema";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

type Context = { params: Promise<{ id: string }> };

const SELECT = {
  id: true,
  status: true,
  channel: true,
  coverLetter: true,
  tailoredCv: true,
  draftWarnings: true,
  submittedAt: true,
  updatedAt: true,
  job: { select: { id: true, title: true, company: true, url: true, applyUrl: true, applyEmail: true } },
} as const;

export async function GET(_request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const application = await db().application.findUnique({ where: { id: (await params).id }, select: SELECT });
  return application ? Response.json(application) : Response.json({ error: "Application not found." }, { status: 404 });
}

const PatchSchema = z.object({
  coverLetter: z.string().max(10_000).optional(),
  tailoredCv: TailoredCvSchema.optional(),
});

/** Saves your edits to a draft. Once you've applied, it's kept as it was sent. */
export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid draft" }, { status: 400 });

  const { id } = await params;
  const { count } = await db().application.updateMany({
    where: { id, submittedAt: null },
    data: {
      coverLetter: body.data.coverLetter,
      tailoredCv: body.data.tailoredCv as Prisma.InputJsonValue | undefined,
    },
  });
  if (!count) return Response.json({ error: "This application has already been submitted or no longer exists." }, { status: 409 });

  return Response.json(await db().application.findUnique({ where: { id }, select: SELECT }));
}
