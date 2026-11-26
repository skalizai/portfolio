-- Family members with their identity documents, and recipients linked to family or staff so they
-- appear when recording money sent home.

ALTER TYPE "household"."Relationship" ADD VALUE 'CHILD';
ALTER TYPE "household"."Relationship" ADD VALUE 'EMPLOYEE';

CREATE TYPE "household"."FamilyRelationship" AS ENUM ('SELF', 'WIFE', 'SON', 'DAUGHTER', 'MOTHER', 'FATHER', 'BROTHER', 'SISTER', 'OTHER');
CREATE TYPE "household"."FamilyDocumentType" AS ENUM ('PASSPORT', 'CNIC', 'B_FORM', 'EMIRATES_ID', 'VISA', 'BIRTH_CERTIFICATE', 'NIKAH_NAMA', 'OTHER');

CREATE TABLE "household"."FamilyMember" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" "household"."FamilyRelationship" NOT NULL,
    "dateOfBirth" DATE,
    "photoFileId" TEXT,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "bloodGroup" TEXT NOT NULL DEFAULT '',
    "cnicNo" TEXT NOT NULL DEFAULT '',
    "cnicExpiry" DATE,
    "passportNo" TEXT NOT NULL DEFAULT '',
    "passportIssued" DATE,
    "passportExpiry" DATE,
    "emiratesIdNo" TEXT NOT NULL DEFAULT '',
    "emiratesIdExpiry" DATE,
    "visaExpiry" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "household"."FamilyDocument" (
    "id" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "type" "household"."FamilyDocumentType" NOT NULL,
    "fileId" TEXT NOT NULL,
    "expiry" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyDocument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "household"."Recipient" ADD COLUMN "familyMemberId" TEXT;
ALTER TABLE "household"."Recipient" ADD COLUMN "employeeId" TEXT;

CREATE UNIQUE INDEX "Recipient_familyMemberId_key" ON "household"."Recipient"("familyMemberId");
CREATE UNIQUE INDEX "Recipient_employeeId_key" ON "household"."Recipient"("employeeId");

ALTER TABLE "household"."FamilyDocument" ADD CONSTRAINT "FamilyDocument_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "household"."FamilyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household"."Recipient" ADD CONSTRAINT "Recipient_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "household"."FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "household"."Recipient" ADD CONSTRAINT "Recipient_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "household"."Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same backstop as the other household tables: no access through the Supabase REST API.
ALTER TABLE "household"."FamilyMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."FamilyDocument" ENABLE ROW LEVEL SECURITY;
