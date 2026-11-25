import { db } from "@/lib/db";

/** Uploaded files are kept in the database, so each is capped to keep the free tier healthy. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED = new Map([
  ["application/pdf", [0x25, 0x50, 0x44, 0x46]], // %PDF
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]], // RIFF
]);

export type FileCheck = { ok: true; mimeType: string } | { ok: false; error: string };

/**
 * Accepts PDFs and JPEG, PNG or WebP images up to 5 MB. The first bytes are checked as well as
 * the stated type, so a renamed file of another kind is refused.
 */
export function checkFile(bytes: Uint8Array, statedType: string): FileCheck {
  if (!bytes.length) return { ok: false, error: "That file is empty." };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: "Files can be up to 5 MB. Please use a smaller scan or photo." };
  const signature = ALLOWED.get(statedType);
  if (!signature) return { ok: false, error: "Please upload a PDF, or a JPEG, PNG or WebP image." };
  if (!signature.every((byte, i) => bytes[i] === byte)) return { ok: false, error: "That file isn't the type it claims to be." };
  return { ok: true, mimeType: statedType };
}

/** Saves an upload from a form, or returns why it was refused. */
export async function saveUpload(file: File, options: { isDemo?: boolean } = {}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkFile(bytes, file.type);
  if (!check.ok) return check;
  const filename = (file.name || "file").replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 120) || "file";
  const saved = await db().storedFile.create({ data: { filename, mimeType: check.mimeType, size: bytes.length, data: bytes, isDemo: options.isDemo ?? false }, select: { id: true } });
  return { ok: true, id: saved.id };
}
