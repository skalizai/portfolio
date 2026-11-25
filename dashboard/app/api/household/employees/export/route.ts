import { requireApiSession } from "@/lib/auth";
import { listEmployees, PAYMENT_LABELS, STATUS_LABELS } from "@/lib/household/employees";
import { xlsxResponse } from "@/lib/household/xlsx";

/** The employee register as an Excel file. IDs and IBANs are in full, since this is your own copy. */
export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const employees = await listEmployees({ q: params.get("q") ?? undefined, status: params.get("status") ?? undefined });
  const headers = [
    "Name",
    "Role",
    "Nationality",
    "Status",
    "Phone",
    "Joining date",
    "Basic (AED)",
    "Allowances (AED)",
    "Payment method",
    "IBAN",
    "Passport no.",
    "Passport expiry",
    "Emirates ID no.",
    "Emirates ID expiry",
    "Visa expiry",
    "Insurance expiry",
    "Contract end",
  ];
  const rows = employees.map((e) => [
    e.fullName,
    e.role,
    e.nationality,
    STATUS_LABELS[e.status],
    e.phone,
    e.joiningDate,
    Number(e.basicSalary),
    e.allowances.reduce((total, a) => total + Number(a.amount), 0),
    PAYMENT_LABELS[e.paymentMethod],
    e.iban,
    e.passportNo,
    e.passportExpiry,
    e.emiratesIdNo,
    e.emiratesIdExpiry,
    e.visaExpiry,
    e.insuranceExpiry,
    e.contractEnd,
  ]);
  return xlsxResponse(`Household employees ${new Date().toISOString().slice(0, 10)}.xlsx`, headers, rows, "Employees");
}
