import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { CvExtractionError, extractProfile } from "@/lib/cv/extractProfile";
import { diffProfiles } from "@/lib/profile/diff";
import { EMPTY_PROFILE } from "@/lib/profile/schema";
import { getProfile, saveCvText } from "@/lib/profile/store";

export const maxDuration = 120;

const BodySchema = z.object({ text: z.string().trim().min(1).max(200_000) });

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

/** Saves the CV's text, and returns what it would change in your profile, which you then choose from. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail("No CV text was received.", 400);

  if (!process.env.ANTHROPIC_API_KEY) return fail("ANTHROPIC_API_KEY isn't set, so the CV can't be read yet.", 503);

  const current = (await getProfile())?.profile ?? EMPTY_PROFILE;

  try {
    const proposed = await extractProfile(body.data.text, current);
    await saveCvText(body.data.text);
    return Response.json({ proposed, changes: diffProfiles(current, proposed) });
  } catch (error) {
    if (error instanceof CvExtractionError) return fail(error.message, 422);
    if (error instanceof Anthropic.RateLimitError) return fail("Claude is rate limited. Try again in a minute.", 429);
    if (error instanceof Anthropic.AuthenticationError) return fail("The Anthropic API key was rejected.", 502);
    if (error instanceof Anthropic.APIError) return fail("Claude couldn't process the CV. Try again shortly.", 502);
    throw error;
  }
}
