import { describe, expect, it } from "vitest";
import { attentionItems, firstNameOf, greeting } from "@/lib/home";
import { D } from "@/lib/household/money";

describe("greeting", () => {
  it("follows the time of day in Dubai, not the server's clock", () => {
    expect(greeting(new Date("2026-11-26T02:30:00Z"))).toBe("Good morning"); // 06:30 Dubai
    expect(greeting(new Date("2026-11-26T09:00:00Z"))).toBe("Good afternoon"); // 13:00
    expect(greeting(new Date("2026-11-26T14:00:00Z"))).toBe("Good evening"); // 18:00
    expect(greeting(new Date("2026-11-25T22:00:00Z"))).toBe("Good evening"); // 02:00
  });
});

describe("firstNameOf", () => {
  it("skips Muhammad and copes with no name", () => {
    expect(firstNameOf("Muhammad Sohail Khan Alizai")).toBe("Sohail");
    expect(firstNameOf("Sohail Khan")).toBe("Sohail");
    expect(firstNameOf(null)).toBeNull();
  });
});

describe("attentionItems", () => {
  const base = { today: new Date("2026-11-26T08:00:00Z"), month: "2026-11", payrollDay: 28, payrollStatus: null, staff: 2, expiries: [], budgets: [], pendingExpenses: 0, targets: [], coverLetters: 0 } as Parameters<typeof attentionItems>[0];

  it("is empty when nothing is due", () => {
    expect(attentionItems({ ...base, today: new Date("2026-11-10T08:00:00Z") })).toEqual([]);
    expect(attentionItems({ ...base, payrollStatus: "PAID" })).toEqual([]);
  });

  it("warns about payroll from three days before payday, and puts urgent items first", () => {
    const items = attentionItems({
      ...base,
      payrollStatus: "DRAFT",
      expiries: [{ employeeId: "e1", employeeName: "Shazia", document: "CNIC", expiry: new Date("2026-11-20"), daysLeft: -6 }],
      pendingExpenses: 1,
      budgets: [{ name: "Groceries", level: "over" }, { name: "Rent", level: "near" }],
      targets: [{ name: "Mother", share: 40, target: new D(1000), sent: new D(400) }],
      coverLetters: 2,
    });
    expect(items.map((i) => i.text)).toEqual([
      "Shazia's CNIC expired 6 days ago",
      "November payroll is in draft",
      "Groceries is over budget this month",
      "1 monthly expense to confirm",
      expect.stringMatching(/^Mother: AED\s400\.00 of AED\s1,000\.00 sent this month$/),
      "2 cover letters ready to review",
    ]);
    expect(items[1]).toMatchObject({ tone: "soon", href: "/household/payroll/2026-11" });
    expect(attentionItems({ ...base, today: new Date("2026-11-28T08:00:00Z") })[0]).toMatchObject({ tone: "urgent", text: "November payroll isn't prepared yet" });
  });

  it("doesn't ask for payroll when there are no staff", () => {
    expect(attentionItems({ ...base, staff: 0 })).toEqual([]);
  });
});
