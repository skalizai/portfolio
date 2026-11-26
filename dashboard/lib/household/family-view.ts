import type { Prisma } from "@/lib/generated/prisma/client";

/* The family form's values, kept here rather than in the form so server pages can use them too. */
export type FamilyFormValues = {
  fullName: string;
  relationship: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  city: string;
  bloodGroup: string;
  cnicNo: string;
  cnicExpiry: string;
  passportNo: string;
  passportIssued: string;
  passportExpiry: string;
  emiratesIdNo: string;
  emiratesIdExpiry: string;
  visaExpiry: string;
  notes: string;
};

export const EMPTY_FAMILY_MEMBER: FamilyFormValues = {
  fullName: "",
  relationship: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  city: "",
  bloodGroup: "",
  cnicNo: "",
  cnicExpiry: "",
  passportNo: "",
  passportIssued: "",
  passportExpiry: "",
  emiratesIdNo: "",
  emiratesIdExpiry: "",
  visaExpiry: "",
  notes: "",
};

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

export function toFamilyFormValues(m: Prisma.FamilyMemberGetPayload<object>): FamilyFormValues {
  return {
    fullName: m.fullName,
    relationship: m.relationship,
    dateOfBirth: day(m.dateOfBirth),
    phone: m.phone,
    email: m.email,
    city: m.city,
    bloodGroup: m.bloodGroup,
    cnicNo: m.cnicNo,
    cnicExpiry: day(m.cnicExpiry),
    passportNo: m.passportNo,
    passportIssued: day(m.passportIssued),
    passportExpiry: day(m.passportExpiry),
    emiratesIdNo: m.emiratesIdNo,
    emiratesIdExpiry: day(m.emiratesIdExpiry),
    visaExpiry: day(m.visaExpiry),
    notes: m.notes,
  };
}
