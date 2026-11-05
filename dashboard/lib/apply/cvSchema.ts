import { z } from "zod";

const short = z.string().trim().max(2000);

const RoleSchema = z.object({
  role: short,
  company: short,
  location: short,
  dates: short,
  bullets: z.array(short).max(100),
});

/** The CV's own content, section by section. */
export const StructuredCvSchema = z.object({
  competencies: z.array(short).max(100),
  experience: z.array(RoleSchema).max(50),
  education: z.array(short).max(30),
  certifications: z.array(short).max(50),
  other: z.array(z.object({ title: short, items: z.array(short).max(50) })).max(20),
});

export type StructuredCv = z.infer<typeof StructuredCvSchema>;

/** A CV ready to show, edit and print: the same content, in an order chosen for one job. */
export const TailoredCvSchema = StructuredCvSchema.extend({
  name: short,
  headline: short,
  summary: z.string().trim().max(3000),
  contact: z.array(short).max(6),
});

export type TailoredCv = z.infer<typeof TailoredCvSchema>;
