import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";

/** Serves an uploaded file to you only. Images and PDFs open in the browser; nothing is cached. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const file = await db().storedFile.findUnique({ where: { id: (await params).id } });
  if (!file) return Response.json({ error: "File not found." }, { status: 404 });
  const download = new URL(request.url).searchParams.has("download");
  const name = encodeURIComponent(file.filename);
  return new Response(file.data as unknown as BodyInit, {
    headers: {
      "content-type": file.mimeType,
      "content-length": String(file.size),
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      // Stops a PDF or image from running anything if opened directly.
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
