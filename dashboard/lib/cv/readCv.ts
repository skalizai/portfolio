import { extractPdfText } from "@/lib/cv/pdfText";

export const CV_FILE_TYPES =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Word's text is read in the browser too, so as with PDFs the file itself is never uploaded. */
async function extractDocxText(file: File): Promise<string> {
  const { default: mammoth } = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value.trim();
}

/** Returns the CV's text, or a message explaining why it couldn't be read. */
export async function readCv(file: File): Promise<{ text: string } | { error: string }> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".doc")) {
    return { error: "Older .doc files can't be read. In Word, use Save As to make it a .docx, then upload that." };
  }

  const isWord = name.endsWith(".docx");
  if (!isWord && !name.endsWith(".pdf")) return { error: "Please choose a PDF or Word (.docx) file." };

  const kind = isWord ? "Word document" : "PDF";
  const text = await (isWord ? extractDocxText(file) : extractPdfText(file)).catch(() => null);
  if (text === null) return { error: `That file couldn't be read as a ${kind}.` };
  if (!text) {
    return { error: isWord ? "No text found in that Word document." : "No text found in that PDF. It may be a scanned image." };
  }
  return { text };
}
