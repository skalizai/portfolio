import type { ZodType } from "zod";
import { saveUpload } from "@/lib/household/files";

/** Reads a form post with an optional file: the text fields are validated, and the file is saved. */
export async function readFormWithFile<T>(request: Request, schema: ZodType<T>, fileField: string): Promise<{ ok: true; data: T; fileId?: string } | { ok: false; response: Response }> {
  const form = await request.formData().catch(() => null);
  if (!form) return { ok: false, response: Response.json({ error: "Please check the form" }, { status: 400 }) };
  const fields = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = schema.safeParse(fields);
  if (!parsed.success) return { ok: false, response: Response.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 }) };
  const file = form.get(fileField);
  if (file instanceof File && file.size > 0) {
    const saved = await saveUpload(file);
    if (!saved.ok) return { ok: false, response: Response.json({ error: saved.error }, { status: 400 }) };
    return { ok: true, data: parsed.data, fileId: saved.id };
  }
  return { ok: true, data: parsed.data };
}

export const resultResponse = (result: { ok: true; id?: string } | { ok: false; error: string; status: number }, created = false) =>
  result.ok ? Response.json({ ok: true, ...(result.id ? { id: result.id } : {}) }, { status: created ? 201 : 200 }) : Response.json({ error: result.error }, { status: result.status });
