import { z } from "zod";
import { db } from "@/lib/db";
import type { ScreeningAnswers } from "@/lib/search/screening.labels";

const answer = z.string().trim().max(300, "Keep each answer to 300 characters or fewer");

export const ScreeningAnswersSchema = z.object({
  noticePeriod: answer,
  visaStatus: answer,
  currentLocation: answer,
  yearsS4Hana: answer,
  yearsCpi: answer,
  salaryExpectation: answer,
});


const EMPTY: ScreeningAnswers = { noticePeriod: "", visaStatus: "", currentLocation: "", yearsS4Hana: "", yearsCpi: "", salaryExpectation: "" };

export async function getScreeningAnswers(): Promise<ScreeningAnswers> {
  const config = await db().searchConfig.findFirst({ orderBy: { updatedAt: "desc" }, select: { screeningAnswers: true } });
  const saved = ScreeningAnswersSchema.partial().safeParse(config?.screeningAnswers);
  return { ...EMPTY, ...(saved.success ? saved.data : {}) };
}

/** A new row leaves keywords and locations empty, so they keep following the profile. */
export async function saveScreeningAnswers(screeningAnswers: ScreeningAnswers): Promise<void> {
  const existing = await db().searchConfig.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } });
  if (existing) await db().searchConfig.update({ where: { id: existing.id }, data: { screeningAnswers } });
  else await db().searchConfig.create({ data: { keywords: [], locations: [], sourcesEnabled: [], screeningAnswers } });
}
