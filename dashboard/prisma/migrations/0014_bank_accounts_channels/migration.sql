-- Bank accounts for family members, chosen when recording money sent home, and the transfer
-- channels (exchange houses, bank apps) you set up once in Settings.

CREATE TABLE "household"."BankAccount" (
    "id" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountTitle" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankAccount_familyMemberId_idx" ON "household"."BankAccount"("familyMemberId");
ALTER TABLE "household"."BankAccount" ADD CONSTRAINT "BankAccount_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "household"."FamilyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "household"."TransferChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferChannel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TransferChannel_name_key" ON "household"."TransferChannel"("name");

-- The channels already typed on real transfers become the starting list.
INSERT INTO "household"."TransferChannel" ("id", "name", "sortOrder")
SELECT 'channel-' || md5("channel"), "channel", (ROW_NUMBER() OVER (ORDER BY MIN("date")))::int
FROM "household"."Remittance"
WHERE "channel" <> '' AND "deletedAt" IS NULL AND NOT "isDemo"
GROUP BY "channel";

ALTER TABLE "household"."Remittance" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "household"."Remittance" ADD CONSTRAINT "Remittance_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "household"."BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same backstop as the other household tables: no access through the Supabase REST API.
ALTER TABLE "household"."BankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household"."TransferChannel" ENABLE ROW LEVEL SECURITY;
