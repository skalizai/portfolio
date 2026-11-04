/**
 * Reads a PDF's text in the browser. The CV is larger than Vercel's 4.5 MB limit on
 * request bodies, and only its text is needed, so the file itself is never uploaded.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const { items } = await page.getTextContent();
      pages.push(items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join(""));
    }
    return pages.join("\n\n").trim();
  } finally {
    await task.destroy();
  }
}
