import { strToU8, zipSync } from "fflate";

/**
 * Writes a real Excel .xlsx file with one sheet. An .xlsx is a zip of a few XML files, so this
 * needs only the zip library, not a spreadsheet package. Numbers stay numbers in Excel.
 */

export type Cell = string | number | Date | null | undefined;

const escapeXml = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function cellXml(value: Cell, ref: string, header: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  // Style 1 is bold for the header row; style 2 shows a date as a date.
  if (value instanceof Date) {
    const serial = value.getTime() / 86_400_000 + 25569;
    return `<c r="${ref}" s="2"><v>${serial}</v></c>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${header ? ' s="1"' : ""}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ""}><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

export function buildXlsx(sheetName: string, headers: string[], rows: Cell[][]): Uint8Array {
  const name = escapeXml(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  const allRows = [headers, ...rows];
  const sheetRows = allRows
    .map((row, r) => `<row r="${r + 1}">${row.map((value, c) => cellXml(value, `${columnName(c)}${r + 1}`, r === 0)).join("")}</row>`)
    .join("");
  const widths = headers.map((h, c) => Math.min(60, Math.max(10, ...allRows.map((row) => String(row[c] ?? "").length + 2), h.length + 2)));

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  };
  return zipSync(files, { level: 6 });
}

/** A download response for an .xlsx file. */
export function xlsxResponse(filename: string, headers: string[], rows: Cell[][], sheetName = "Sheet1"): Response {
  const body = buildXlsx(sheetName, headers, rows);
  return new Response(body as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9 ._-]/g, "")}"`,
      "cache-control": "no-store",
    },
  });
}
