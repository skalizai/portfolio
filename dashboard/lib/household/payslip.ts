/**
 * What a payslip shows. The content is frozen when payroll is marked paid, so a payslip never
 * changes afterwards, even if an employee's details do.
 */
export type PayslipSnapshot = {
  currency: "PKR";
  month: string;
  employer: { name: string; address: string };
  employee: { name: string; role: string; cnic: string; joiningDate: string };
  earnings: { label: string; amount: string }[];
  deductions: { label: string; amount: string }[];
  gross: string;
  totalDeductions: string;
  net: string;
  advanceOutstanding: string;
  payment: { date: string; method: string; reference: string };
};

/**
 * Every word on a payslip, by language. Only English exists today. To add Urdu, say, add a "ur"
 * entry with the same keys; the PDF also needs a font with Urdu script, and a right-to-left layout.
 */
export const PAYSLIP_TEXT = {
  en: {
    title: "Payslip",
    period: "Pay period",
    payslipNo: "Payslip no.",
    employee: "Employee",
    role: "Role",
    cnic: "CNIC",
    joined: "Joined",
    earnings: "Earnings",
    deductions: "Deductions",
    noDeductions: "No deductions",
    gross: "Gross pay",
    totalDeductions: "Total deductions",
    net: "Net pay",
    advanceBalance: "Advance balance remaining",
    paidOn: "Paid on",
    paidBy: "Paid by",
    reference: "Reference",
    employerSignature: "Employer signature",
    receivedBy: "Received by (employee signature)",
    date: "Date",
    amountsIn: "All amounts in Pakistani rupees (PKR).",
  },
} as const;

export type PayslipLanguage = keyof typeof PAYSLIP_TEXT;
export const PAYSLIP_LANGUAGES: PayslipLanguage[] = ["en"];

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const periodLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));
export const longDate = (iso: string) => dateFormat.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

/** PKR on a payslip: whole rupees, and paisa only when there are any. */
export function rupees(amount: string): string {
  const value = Number(amount);
  return `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** A short, stable number for the payslip, such as PS-202611-7F3A. */
export const payslipNumber = (id: string, month: string) => `PS-${month.replace("-", "")}-${id.slice(-4).toUpperCase()}`;

/** A safe file name, such as "Payslip 2026-11 Shazia Bibi.pdf". */
export const payslipFilename = (snapshot: Pick<PayslipSnapshot, "month" | "employee">) =>
  `Payslip ${snapshot.month} ${snapshot.employee.name}`.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 100) + ".pdf";

/** Whether the employee had a CNIC on file when the payslip was made. */
export const hasCnic = (s: Pick<PayslipSnapshot, "employee">) => Boolean(s.employee.cnic) && s.employee.cnic !== "–";
