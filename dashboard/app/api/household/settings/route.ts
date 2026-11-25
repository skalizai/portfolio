import { requireApiSession } from "@/lib/auth";
import { saveHouseholdSettings, SettingsInputSchema } from "@/lib/household/settings";

export async function PUT(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = SettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
  await saveHouseholdSettings(body.data);
  return Response.json({ ok: true });
}
