-- The sign-in password kept in the database so it can be changed from the Security page, and the
-- emailed codes that confirm a change or reset.

CREATE TABLE "jobmatch"."Credential" (
    "id" TEXT NOT NULL DEFAULT 'owner',
    "passwordHash" TEXT NOT NULL,
    "sessionsValidFrom" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jobmatch"."VerificationCode" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerificationCode_purpose_createdAt_idx" ON "jobmatch"."VerificationCode"("purpose", "createdAt");

-- No access through the Supabase REST API, like the other tables.
ALTER TABLE "jobmatch"."Credential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobmatch"."VerificationCode" ENABLE ROW LEVEL SECURITY;
