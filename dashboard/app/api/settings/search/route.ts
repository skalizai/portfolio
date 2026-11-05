import { requireApiSession } from "@/lib/auth";
import { SearchSettingsSchema, saveSearchSettings } from "@/lib/search/settings";

export async function PUT(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = SearchSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
  }

  await saveSearchSettings(body.data);
  return Response.json(body.data);
}
