-- Household staff are in Pakistan: CNIC and Cantt Pass replace UAE documents, pay is in PKR, and
-- they are paid in cash or by bank transfer. No employees existed yet, so nothing is lost.

-- AlterEnum
BEGIN;
CREATE TYPE "household"."StaffPaymentMethod_new" AS ENUM ('CASH', 'BANK_TRANSFER');
ALTER TABLE "household"."Employee" ALTER COLUMN "paymentMethod" DROP DEFAULT;
ALTER TABLE "household"."Employee" ALTER COLUMN "paymentMethod" TYPE "household"."StaffPaymentMethod_new" USING ("paymentMethod"::text::"household"."StaffPaymentMethod_new");
ALTER TYPE "household"."StaffPaymentMethod" RENAME TO "StaffPaymentMethod_old";
ALTER TYPE "household"."StaffPaymentMethod_new" RENAME TO "StaffPaymentMethod";
DROP TYPE "household"."StaffPaymentMethod_old";
ALTER TABLE "household"."Employee" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "household"."DocumentType_new" AS ENUM ('CONTRACT', 'CNIC', 'CANTT_PASS', 'OTHER');
ALTER TABLE "household"."EmployeeDocument" ALTER COLUMN "type" TYPE "household"."DocumentType_new" USING ("type"::text::"household"."DocumentType_new");
ALTER TYPE "household"."DocumentType" RENAME TO "DocumentType_old";
ALTER TYPE "household"."DocumentType_new" RENAME TO "DocumentType";
DROP TYPE "household"."DocumentType_old";
COMMIT;

-- AlterTable
ALTER TABLE "household"."Employee" DROP COLUMN "airTicket",
DROP COLUMN "airTicketAmount",
DROP COLUMN "contractNo",
DROP COLUMN "emiratesIdExpiry",
DROP COLUMN "emiratesIdNo",
DROP COLUMN "homeContact",
DROP COLUMN "insuranceExpiry",
DROP COLUMN "passportExpiry",
DROP COLUMN "passportNo",
DROP COLUMN "visaExpiry",
ADD COLUMN     "canttPassExpiry" DATE,
ADD COLUMN     "canttPassNo" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cnicExpiry" DATE,
ADD COLUMN     "cnicNo" TEXT NOT NULL DEFAULT '';

