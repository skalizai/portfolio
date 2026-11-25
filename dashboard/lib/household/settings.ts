import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/household/audit";

export const SettingsInputSchema = z.object({
  employerName: z.string().trim().min(1, "Enter your household or employer name").max(120),
  address: z.string().trim().max(300).default(""),
  defaultPkrPerAed: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "The exchange rate must be a number, like 76.25")
    .refine((value) => Number(value) > 0, "The exchange rate must be above zero"),
  payrollDay: z.coerce.number().int().min(1, "Choose a day from 1 to 28").max(28, "Choose a day from 1 to 28"),
  expiryAlertDays: z.coerce.number().int().min(1, "Choose 1 to 365 days").max(365, "Choose 1 to 365 days"),
  gratuityDaysPerYear: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Enter the number of days, like 14")
    .refine((value) => Number(value) <= 60, "That's more than 60 days a year"),
});

/** The single settings row, created with defaults if it's somehow missing. */
export async function getHouseholdSettings() {
  // A plain read; the row is only written in the rare case it's missing.
  return (await db().householdSettings.findUnique({ where: { id: "default" } })) ?? db().householdSettings.create({ data: { id: "default" } });
}

export async function saveHouseholdSettings(input: z.infer<typeof SettingsInputSchema>) {
  return db().$transaction(async (tx) => {
    const before = await tx.householdSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
    const after = await tx.householdSettings.update({ where: { id: "default" }, data: input });
    await audit(tx, { entity: "Settings", entityId: "default", action: "update", before, after });
    return after;
  });
}
