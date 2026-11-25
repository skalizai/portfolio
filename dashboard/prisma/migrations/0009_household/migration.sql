-- Household & Family lives in its own schema, apart from jobs, investments and stockradar.
CREATE SCHEMA IF NOT EXISTS "household";

-- CreateEnum
CREATE TYPE "household"."EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'LEFT');

-- CreateEnum
CREATE TYPE "household"."StaffPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'WPS', 'EXCHANGE_HOUSE');

-- CreateEnum
CREATE TYPE "household"."AdvancePlan" AS ENUM ('ONE_TIME', 'FIXED_MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "household"."AdvanceStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "household"."InstallmentStatus" AS ENUM ('DUE', 'PAID', 'SKIPPED');

-- CreateEnum
CREATE TYPE "household"."PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "household"."Relationship" AS ENUM ('WIFE', 'MOTHER', 'FATHER', 'SIBLING', 'OTHER');

-- CreateEnum
CREATE TYPE "household"."RemittancePurpose" AS ENUM ('HOUSEHOLD', 'SCHOOL_FEES', 'MEDICAL', 'CONSTRUCTION', 'SAVINGS', 'OTHER');

-- CreateEnum
CREATE TYPE "household"."ExpenseStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "household"."DocumentType" AS ENUM ('CONTRACT', 'PASSPORT', 'EMIRATES_ID', 'VISA', 'INSURANCE', 'OTHER');

-- CreateTable
CREATE TABLE "household"."HouseholdSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "employerName" TEXT NOT NULL DEFAULT 'My household',
    "address" TEXT NOT NULL DEFAULT '',
    "logoFileId" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'AED',
    "secondaryCurrency" TEXT NOT NULL DEFAULT 'PKR',
    "defaultPkrPerAed" DECIMAL(18,6) NOT NULL DEFAULT 75,
    "payrollDay" INTEGER NOT NULL DEFAULT 28,
    "expiryAlertDays" INTEGER NOT NULL DEFAULT 60,
    "gratuityDaysPerYear" DECIMAL(6,2) NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."StoredFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."Employee" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "nationality" TEXT NOT NULL DEFAULT '',
    "photoFileId" TEXT,
    "phone" TEXT NOT NULL DEFAULT '',
    "homeContact" TEXT NOT NULL DEFAULT '',
    "passportNo" TEXT NOT NULL DEFAULT '',
    "passportExpiry" DATE,
    "emiratesIdNo" TEXT NOT NULL DEFAULT '',
    "emiratesIdExpiry" DATE,
    "visaExpiry" DATE,
    "contractNo" TEXT NOT NULL DEFAULT '',
    "insuranceExpiry" DATE,
    "joiningDate" DATE NOT NULL,
    "contractStart" DATE,
    "contractEnd" DATE,
    "status" "household"."EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "basicSalary" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "household"."StaffPaymentMethod" NOT NULL DEFAULT 'CASH',
    "bankName" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "leaveDaysPerYear" INTEGER NOT NULL DEFAULT 30,
    "airTicket" BOOLEAN NOT NULL DEFAULT false,
    "airTicketAmount" DECIMAL(18,2),
    "notes" TEXT NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."EmployeeAllowance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "EmployeeAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "household"."DocumentType" NOT NULL,
    "fileId" TEXT NOT NULL,
    "expiry" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."Advance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "plan" "household"."AdvancePlan" NOT NULL,
    "status" "household"."AdvanceStatus" NOT NULL DEFAULT 'OPEN',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."AdvanceInstallment" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "household"."InstallmentStatus" NOT NULL DEFAULT 'DUE',
    "note" TEXT NOT NULL DEFAULT '',
    "payrollLineId" TEXT,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "AdvanceInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."PayrollRun" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "household"."PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "paidAt" DATE,
    "paidMethod" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "totalGross" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."PayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basic" DECIMAL(18,2) NOT NULL,
    "allowances" JSONB NOT NULL DEFAULT '[]',
    "earnings" JSONB NOT NULL DEFAULT '[]',
    "deductions" JSONB NOT NULL DEFAULT '[]',
    "unpaidDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "gross" DECIMAL(18,2) NOT NULL,
    "totalDeductions" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."Payslip" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."Recipient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" "household"."Relationship" NOT NULL DEFAULT 'OTHER',
    "phone" TEXT NOT NULL DEFAULT '',
    "account" TEXT NOT NULL DEFAULT '',
    "wallet" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "monthlyTargetAed" DECIMAL(18,2),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."Remittance" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amountAed" DECIMAL(18,2) NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "amountPkr" DECIMAL(18,2) NOT NULL,
    "feeAed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "purpose" "household"."RemittancePurpose" NOT NULL DEFAULT 'HOUSEHOLD',
    "receiptFileId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyBudgetAed" DECIMAL(18,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."Expense" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "rateToAed" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "amountAed" DECIMAL(18,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "receiptFileId" TEXT,
    "status" "household"."ExpenseStatus" NOT NULL DEFAULT 'CONFIRMED',
    "recurringId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."RecurringExpense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCreatedMonth" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household"."HouseholdAuditLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvanceInstallment_month_status_idx" ON "household"."AdvanceInstallment"("month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_month_key" ON "household"."PayrollRun"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_employeeId_key" ON "household"."PayrollLine"("runId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_runId_employeeId_key" ON "household"."Payslip"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "Remittance_date_idx" ON "household"."Remittance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "household"."ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "household"."Expense"("date");

-- CreateIndex
CREATE INDEX "HouseholdAuditLog_entity_entityId_idx" ON "household"."HouseholdAuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "HouseholdAuditLog_at_idx" ON "household"."HouseholdAuditLog"("at");

-- AddForeignKey
ALTER TABLE "household"."EmployeeAllowance" ADD CONSTRAINT "EmployeeAllowance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "household"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "household"."Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."Advance" ADD CONSTRAINT "Advance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "household"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."AdvanceInstallment" ADD CONSTRAINT "AdvanceInstallment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "household"."Advance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "household"."PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "household"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "household"."PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "household"."Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."Remittance" ADD CONSTRAINT "Remittance_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "household"."Recipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "household"."ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household"."RecurringExpense" ADD CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "household"."ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- With row-level security on and no policies, the Supabase REST API can read nothing here.
-- Prisma connects as the table owner, so the app is unaffected.
ALTER TABLE "household"."HouseholdSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."StoredFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."EmployeeAllowance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."EmployeeDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."Advance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."AdvanceInstallment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."PayrollRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."PayrollLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."Payslip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."Recipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."Remittance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."ExpenseCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."RecurringExpense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."HouseholdAuditLog" ENABLE ROW LEVEL SECURITY;

-- Starting data: settings, the expense categories you listed, and "Wife" as a recipient to edit.
INSERT INTO "household"."HouseholdSettings" ("id", "updatedAt") VALUES ('default', now());

INSERT INTO "household"."ExpenseCategory" ("id", "name", "sortOrder") VALUES
  ('cat-rent', 'Rent', 1),
  ('cat-utilities', 'Utilities / DEWA', 2),
  ('cat-groceries', 'Groceries', 3),
  ('cat-school', 'School fees', 4),
  ('cat-car', 'Car, fuel and Salik', 5),
  ('cat-insurance', 'Insurance', 6),
  ('cat-govt', 'Visa and government fees', 7),
  ('cat-staff', 'Household staff (not payroll)', 8),
  ('cat-medical', 'Medical', 9),
  ('cat-other', 'Other', 10);

INSERT INTO "household"."Recipient" ("id", "name", "relationship") VALUES ('recipient-wife', 'Wife', 'WIFE');
