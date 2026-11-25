import type { Prisma } from "@/lib/generated/prisma/client";

/* The edit form's values, kept here rather than in the form so server pages can use them too. */
export type EmployeeFormValues = {
  fullName: string;
  role: string;
  nationality: string;
  phone: string;
  homeContact: string;
  passportNo: string;
  passportExpiry: string;
  emiratesIdNo: string;
  emiratesIdExpiry: string;
  visaExpiry: string;
  contractNo: string;
  insuranceExpiry: string;
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
  airTicket: boolean;
  airTicketAmount: string;
  notes: string;
};

export const EMPTY_EMPLOYEE: EmployeeFormValues = {
  fullName: "",
  role: "",
  nationality: "",
  phone: "",
  homeContact: "",
  passportNo: "",
  passportExpiry: "",
  emiratesIdNo: "",
  emiratesIdExpiry: "",
  visaExpiry: "",
  contractNo: "",
  insuranceExpiry: "",
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
  airTicket: false,
  airTicketAmount: "",
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
    homeContact: e.homeContact,
    passportNo: e.passportNo,
    passportExpiry: day(e.passportExpiry),
    emiratesIdNo: e.emiratesIdNo,
    emiratesIdExpiry: day(e.emiratesIdExpiry),
    visaExpiry: day(e.visaExpiry),
    contractNo: e.contractNo,
    insuranceExpiry: day(e.insuranceExpiry),
    joiningDate: day(e.joiningDate),
    contractStart: day(e.contractStart),
    contractEnd: day(e.contractEnd),
    status: e.status,
    basicSalary: e.basicSalary.toFixed(2),
    allowances: e.allowances.map((a) => ({ name: a.name, amount: a.amount.toFixed(2) })),
    paymentMethod: e.paymentMethod,
    bankName: e.bankName,
    iban: e.iban,
    leaveDaysPerYear: e.leaveDaysPerYear,
    airTicket: e.airTicket,
    airTicketAmount: e.airTicketAmount ? e.airTicketAmount.toFixed(2) : "",
    notes: e.notes,
  };
}
