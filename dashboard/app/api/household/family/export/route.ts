import { requireApiSession } from "@/lib/auth";
import { FAMILY_RELATIONSHIP_LABELS, listFamily } from "@/lib/household/family";
import { xlsxResponse } from "@/lib/household/xlsx";

/** Your family's details and document numbers in full, as your own Excel copy. */
export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;

  const members = await listFamily();
  const headers = ["Name", "Relationship", "Date of birth", "Phone", "Email", "City", "Blood group", "CNIC / B-Form no.", "CNIC expiry", "Passport no.", "Passport issued", "Passport expiry", "Emirates ID no.", "Emirates ID expiry", "UAE visa expiry", "Notes"];
  const rows = members.map((m) => [
    m.fullName,
    FAMILY_RELATIONSHIP_LABELS[m.relationship],
    m.dateOfBirth,
    m.phone,
    m.email,
    m.city,
    m.bloodGroup,
    m.cnicNo,
    m.cnicExpiry,
    m.passportNo,
    m.passportIssued,
    m.passportExpiry,
    m.emiratesIdNo,
    m.emiratesIdExpiry,
    m.visaExpiry,
    m.notes,
  ]);
  return xlsxResponse(`Family ${new Date().toISOString().slice(0, 10)}.xlsx`, headers, rows, "Family");
}
