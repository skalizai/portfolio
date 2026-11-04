import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { saveProfile } from "@/lib/profile/store";
import { ProfileSchema } from "@/lib/profile/schema";

const BodySchema = z.object({
  profile: ProfileSchema,
  cvText: z.string().max(200_000).optional(),
});

export async function PUT(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    const issue = body.error.issues[0];
    return Response.json({ error: issue?.message ?? "Invalid profile", field: issue?.path.join(".") }, { status: 400 });
  }

  const updatedAt = await saveProfile(body.data.profile, body.data.cvText);
  return Response.json({ updatedAt });
}
