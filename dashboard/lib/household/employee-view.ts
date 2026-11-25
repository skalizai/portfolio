import type { Prisma } from "@/lib/generated/prisma/client";

/* The edit form's values, kept here rather than in the form so server pages can use them too. */
export type EmployeeFormValues = {
  fullName: string;
  role: string;
  nationality: string;
  phone: string;
  cnicNo: string;
  cnicExpiry: string;
  canttPassNo: string;
  canttPassExpiry: string;
  joiningDate: string;
  contractStart: string;
  contractEnd: string;
  status: string;
  basicSalary: string;
  allowances: { name: string; amount: string }[];
  paymentMethod: string;
  bankName: string;
  iban: string;
  leaveDaysPerYear: number;
  notes: string;
};

export const EMPTY_EMPLOYEE: EmployeeFormValues = {
  fullName: "",
  role: "",
  nationality: "",
  phone: "",
  cnicNo: "",
  cnicExpiry: "",
  canttPassNo: "",
  canttPassExpiry: "",
  joiningDate: "",
  contractStart: "",
  contractEnd: "",
  status: "ACTIVE",
  basicSalary: "",
  allowances: [],
  paymentMethod: "CASH",
  bankName: "",
  iban: "",
  leaveDaysPerYear: 30,
  notes: "",
};


const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

/** Turns a saved employee into the plain values the edit form needs. */
export function toFormValues(e: Prisma.EmployeeGetPayload<{ include: { allowances: true } }>): EmployeeFormValues {
  return {
    fullName: e.fullName,
    role: e.role,
    nationality: e.nationality,
    phone: e.phone,
    cnicNo: e.cnicNo,
    cnicExpiry: day(e.cnicExpiry),
    canttPassNo: e.canttPassNo,
    canttPassExpiry: day(e.canttPassExpiry),
    joiningDate: day(e.joiningDate),
    contractStart: day(e.contractStart),
    contractEnd: day(e.contractEnd),
    status: e.status,
    basicSalary: e.basicSalary.toFixed(0),
    allowances: e.allowances.map((a) => ({ name: a.name, amount: a.amount.toFixed(0) })),
    paymentMethod: e.paymentMethod,
    bankName: e.bankName,
    iban: e.iban,
    leaveDaysPerYear: e.leaveDaysPerYear,
    notes: e.notes,
  };
}
