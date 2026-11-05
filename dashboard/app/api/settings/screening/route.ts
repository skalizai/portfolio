import { requireApiSession } from "@/lib/auth";
import { saveScreeningAnswers, ScreeningAnswersSchema } from "@/lib/search/screening";

export async function PUT(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = ScreeningAnswersSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues[0]?.message ?? "Invalid answers" }, { status: 400 });
  }

  await saveScreeningAnswers(body.data);
  return Response.json(body.data);
}
