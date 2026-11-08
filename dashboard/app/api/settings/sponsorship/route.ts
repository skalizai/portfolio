import { requireApiSession } from "@/lib/auth";
import { saveSponsorshipRules } from "@/lib/search/settings";
import { SponsorshipRulesSchema } from "@/lib/search/sponsorship";

export async function PUT(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = SponsorshipRulesSchema.safeParse((await request.json().catch(() => null))?.rules);
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid rules" }, { status: 400 });

  const { addedLocations } = await saveSponsorshipRules(body.data);
  return Response.json({ rules: body.data, addedLocations });
}
