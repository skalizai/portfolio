import { describe, expect, it } from "vitest";
import { EmployeeInputSchema, estimatedGratuity, expiryAlerts } from "@/lib/household/employees";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("estimatedGratuity", () => {
  it("counts only completed years, at basic ÷ 30 per day", () => {
    // PKR 36,000 basic is 1,200 a day; 14 days a year is 16,800 a year.
    expect(estimatedGratuity("36000", day("2021-03-15"), "14", day("2026-03-14"))).toMatchObject({ years: 4 });
    const fifth = estimatedGratuity("36000", day("2021-03-15"), "14", day("2026-03-15"));
    expect(fifth.years).toBe(5);
    expect(fifth.amount.toFixed(2)).toBe("84000.00");
    expect(estimatedGratuity("35000", day("2026-01-01"), "14", day("2026-11-25")).amount.toFixed(2)).toBe("0.00");
  });

  it("follows the configured days per year", () => {
    expect(estimatedGratuity("30000", day("2020-01-01"), "30", day("2026-06-01")).amount.toFixed(2)).toBe("180000.00");
  });
});

describe("expiryAlerts", () => {
  const base = { status: "ACTIVE", cnicExpiry: null, canttPassExpiry: null, contractEnd: null };
  const today = day("2026-11-25");

  it("lists CNICs, Cantt Passes and contracts expiring within the window, and expired ones, soonest first", () => {
    const alerts = expiryAlerts(
      [
        { ...base, id: "a", fullName: "Shazia", cnicExpiry: day("2027-01-20"), canttPassExpiry: day("2026-11-20") },
        { ...base, id: "b", fullName: "Aslam", contractEnd: day("2026-12-01"), cnicExpiry: day("2029-06-01") },
      ],
      60,
      today,
    );
    expect(alerts.map((a) => `${a.employeeName} ${a.document} ${a.daysLeft}`)).toEqual(["Shazia Cantt Pass -5", "Aslam Contract 6", "Shazia CNIC 56"]);
  });

  it("includes uploaded documents with an expiry, and skips people who have left", () => {
    const alerts = expiryAlerts(
      [
        { ...base, id: "a", fullName: "Shazia", documents: [{ type: "CANTT_PASS", expiry: day("2026-12-10") }] },
        { ...base, id: "b", fullName: "Gone", status: "LEFT", cnicExpiry: day("2026-11-30") },
      ],
      30,
      today,
    );
    expect(alerts.map((a) => a.document)).toEqual(["Cantt Pass copy (file)"]);
  });
});

describe("EmployeeInputSchema", () => {
  const valid = { fullName: "Shazia Bibi", role: "Maid", joiningDate: "2024-02-01", basicSalary: "35000", iban: "" };

  it("accepts the essentials, and tidies the CNIC and IBAN", () => {
    const parsed = EmployeeInputSchema.parse({ ...valid, cnicNo: "3520212345671", iban: "pk36 scbl 0000 0011 2345 6702", allowances: [{ name: "Food", amount: "3000" }] });
    expect(parsed.cnicNo).toBe("35202-1234567-1");
    expect(parsed.iban).toBe("PK36SCBL0000001123456702");
    expect(parsed.joiningDate.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(parsed.cnicExpiry).toBeNull();
    expect(EmployeeInputSchema.parse({ ...valid, cnicNo: "35202-1234567-1" }).cnicNo).toBe("35202-1234567-1");
  });

  it("allows only cash or bank transfer", () => {
    expect(EmployeeInputSchema.safeParse({ ...valid, paymentMethod: "BANK_TRANSFER" }).success).toBe(true);
    expect(EmployeeInputSchema.safeParse({ ...valid, paymentMethod: "WPS" }).success).toBe(false);
  });

  it("explains what's wrong", () => {
    const issue = (input: object) => EmployeeInputSchema.safeParse({ ...valid, ...input }).error?.issues[0]?.message;
    expect(issue({ fullName: "" })).toBe("Enter the full name");
    expect(issue({ basicSalary: "35,000" })).toContain("amount in rupees");
    expect(issue({ cnicNo: "12345" })).toContain("13 digits");
    expect(issue({ iban: "12345" })).toContain("IBAN");
    expect(issue({ contractStart: "2026-05-01", contractEnd: "2026-01-01" })).toContain("can't end before it starts");
    expect(issue({ allowances: [{ name: "", amount: "100" }] })).toBe("Name each allowance");
  });
});
