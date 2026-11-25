import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { checkFile, MAX_FILE_BYTES } from "@/lib/household/files";
import { achievedRate, addMonths, aedFromPkr, isMonth, mask, monthRange, pkrFromAed, round2 } from "@/lib/household/money";
import { buildXlsx } from "@/lib/household/xlsx";

describe("AED and PKR conversion", () => {
  it("converts at a rate of PKR per 1 AED, to the paisa", () => {
    expect(pkrFromAed("1000", "76.25").toFixed(2)).toBe("76250.00");
    expect(pkrFromAed("1234.56", "75.8932").toFixed(2)).toBe("93694.71");
    expect(aedFromPkr("76250", "76.25").toFixed(2)).toBe("1000.00");
    expect(aedFromPkr("100000", "76.3").toFixed(2)).toBe("1310.62");
  });

  it("rounds half away from zero, and refuses a zero rate", () => {
    expect(round2("0.005").toFixed(2)).toBe("0.01");
    expect(round2("2.675").toFixed(2)).toBe("2.68");
    expect(() => aedFromPkr("100", "0")).toThrow("above zero");
  });

  it("works out the rate actually achieved", () => {
    expect(achievedRate("1000", "76100")!.toString()).toBe("76.1");
    expect(achievedRate("0", "100")).toBeNull();
  });
});

describe("months", () => {
  it("validates and steps through months across year ends", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2026-02").end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("masking", () => {
  it("shows only the last four characters", () => {
    expect(mask("AE07 0331 2345 6789 0123 456")).toBe("•••• 3456");
    expect(mask("784-1990-1234567-1")).toBe("•••• 67-1");
    expect(mask("")).toBe("–");
  });
});

describe("uploads", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  it("accepts a real PDF and refuses renamed, empty or oversized files", () => {
    expect(checkFile(pdf, "application/pdf")).toEqual({ ok: true, mimeType: "application/pdf" });
    expect(checkFile(pdf, "image/png")).toMatchObject({ ok: false, error: expect.stringContaining("isn't the type") });
    expect(checkFile(pdf, "text/html")).toMatchObject({ ok: false });
    expect(checkFile(new Uint8Array(), "application/pdf")).toMatchObject({ ok: false, error: expect.stringContaining("empty") });
    expect(checkFile(new Uint8Array(MAX_FILE_BYTES + 1), "application/pdf")).toMatchObject({ ok: false, error: expect.stringContaining("5 MB") });
  });
});

describe("Excel export", () => {
  it("writes a workbook with a bold header, numbers as numbers and text escaped", () => {
    const file = unzipSync(buildXlsx("Remittances", ["Date", "Recipient", "AED"], [[new Date("2026-11-01T00:00:00Z"), "Wife <Karachi> & co", 1500.5]]));
    expect(Object.keys(file).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    const sheet = strFromU8(file["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(sheet).toContain("Wife &lt;Karachi&gt; &amp; co");
    expect(sheet).toContain('<c r="C2"><v>1500.5</v></c>');
    expect(sheet).toContain('<c r="A2" s="2"><v>46327</v></c>');
    expect(strFromU8(file["xl/workbook.xml"]!)).toContain('name="Remittances"');
  });
});
