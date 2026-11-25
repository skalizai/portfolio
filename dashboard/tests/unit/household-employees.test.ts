import { describe, expect, it } from "vitest";
import { EmployeeInputSchema, estimatedGratuity, expiryAlerts } from "@/lib/household/employees";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("estimatedGratuity", () => {
  it("counts only completed years, at basic ÷ 30 per day", () => {
    // 2,000 basic is 66.67 a day; 14 days a year is 933.33 a year.
    expect(estimatedGratuity("2000", day("2021-03-15"), "14", day("2026-03-14"))).toMatchObject({ years: 4 });
    const fifth = estimatedGratuity("2000", day("2021-03-15"), "14", day("2026-03-15"));
    expect(fifth.years).toBe(5);
    expect(fifth.amount.toFixed(2)).toBe("4666.67");
    expect(estimatedGratuity("1500", day("2026-01-01"), "14", day("2026-11-25")).amount.toFixed(2)).toBe("0.00");
  });

  it("follows the configured days per year", () => {
    expect(estimatedGratuity("3000", day("2020-01-01"), "21", day("2026-06-01")).amount.toFixed(2)).toBe("12600.00");
  });
});

describe("expiryAlerts", () => {
  const base = { status: "ACTIVE", passportExpiry: null, emiratesIdExpiry: null, visaExpiry: null, insuranceExpiry: null, contractEnd: null };
  const today = day("2026-11-25");

  it("lists documents expiring within the window, and expired ones, soonest first", () => {
    const alerts = expiryAlerts(
      [
        { ...base, id: "a", fullName: "Maria", passportExpiry: day("2027-01-20"), visaExpiry: day("2026-11-20") },
        { ...base, id: "b", fullName: "Ahmed", emiratesIdExpiry: day("2026-12-01"), insuranceExpiry: day("2027-06-01") },
      ],
      60,
      today,
    );
    expect(alerts.map((a) => `${a.employeeName} ${a.document} ${a.daysLeft}`)).toEqual(["Maria Visa or permit -5", "Ahmed Emirates ID 6", "Maria Passport 56"]);
  });

  it("includes uploaded documents with an expiry, and skips people who have left", () => {
    const alerts = expiryAlerts(
      [
        { ...base, id: "a", fullName: "Maria", documents: [{ type: "INSURANCE", expiry: day("2026-12-10") }] },
        { ...base, id: "b", fullName: "Gone", status: "LEFT", passportExpiry: day("2026-11-30") },
      ],
      30,
      today,
    );
    expect(alerts.map((a) => a.document)).toEqual(["Medical insurance (file)"]);
  });
});

describe("EmployeeInputSchema", () => {
  const valid = { fullName: "Maria Santos", role: "Maid", joiningDate: "2024-02-01", basicSalary: "1500", iban: "" };

  it("accepts the essentials and normalises the IBAN", () => {
    const parsed = EmployeeInputSchema.parse({ ...valid, iban: "ae07 0331 2345 6789 0123 456", allowances: [{ name: "Food", amount: "200" }] });
    expect(parsed.iban).toBe("AE070331234567890123456");
    expect(parsed.joiningDate.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(parsed.passportExpiry).toBeNull();
  });

  it("explains what's wrong", () => {
    const issue = (input: object) => EmployeeInputSchema.safeParse({ ...valid, ...input }).error?.issues[0]?.message;
    expect(issue({ fullName: "" })).toBe("Enter the full name");
    expect(issue({ basicSalary: "1,500" })).toContain("must be an amount");
    expect(issue({ iban: "12345" })).toContain("IBAN");
    expect(issue({ contractStart: "2026-05-01", contractEnd: "2026-01-01" })).toContain("can't end before it starts");
    expect(issue({ allowances: [{ name: "", amount: "100" }] })).toBe("Name each allowance");
  });
});
