-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "jobmatch";

-- CreateEnum
CREATE TYPE "jobmatch"."ApplyChannel" AS ENUM ('EMAIL', 'ATS_FORM', 'LINKEDIN_EASY_APPLY', 'COMPANY_SITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "jobmatch"."Verdict" AS ENUM ('STRONG', 'GOOD', 'WEAK', 'REJECT');

-- CreateEnum
CREATE TYPE "jobmatch"."SeniorityFit" AS ENUM ('under', 'fit', 'over');

-- CreateEnum
CREATE TYPE "jobmatch"."ApplicationStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED', 'OPENED_EXTERNALLY', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "jobmatch"."JobState" AS ENUM ('ACTIVE', 'SAVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "jobmatch"."Profile" (
    "id" TEXT NOT NULL,
    "json" JSONB NOT NULL,
    "cvFileUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobmatch"."Job" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceJobId" TEXT NOT NULL,
    "publisher" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "workMode" TEXT,
    "employmentType" TEXT,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "applyUrl" TEXT,
    "applyEmail" TEXT,
    "applyChannel" "jobmatch"."ApplyChannel" NOT NULL DEFAULT 'UNKNOWN',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT,
    "postedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeHash" TEXT NOT NULL,
    "rawJson" JSONB,
    "state" "jobmatch"."JobState" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobmatch"."MatchScore" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "verdict" "jobmatch"."Verdict" NOT NULL,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "keyRequirements" TEXT[],
    "redFlags" TEXT[],
    "seniorityFit" "jobmatch"."SeniorityFit" NOT NULL,
    "locationFit" BOOLEAN NOT NULL,
    "reasoning" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "profileUpdatedAt" TIMESTAMP(3) NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobmatch"."Application" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "jobmatch"."ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" "jobmatch"."ApplyChannel" NOT NULL,
    "coverLetter" TEXT,
    "tailoredCvUrl" TEXT,
    "emailMessageId" TEXT,
    "sendAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "notes" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobmatch"."SearchConfig" (
    "id" TEXT NOT NULL,
    "keywords" TEXT[],
    "locations" TEXT[],
    "minScore" INTEGER NOT NULL DEFAULT 70,
    "sourcesEnabled" TEXT[],
    "schedule" TEXT NOT NULL DEFAULT '0 */2 * * *',
    "dailyApplyCap" INTEGER NOT NULL DEFAULT 15,
    "screeningAnswers" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobmatch"."AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "jobId" TEXT,
    "applicationId" TEXT,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeHash_key" ON "jobmatch"."Job"("dedupeHash");

-- CreateIndex
CREATE INDEX "Job_company_postedAt_idx" ON "jobmatch"."Job"("company", "postedAt");

-- CreateIndex
CREATE INDEX "Job_state_postedAt_idx" ON "jobmatch"."Job"("state", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_source_sourceJobId_key" ON "jobmatch"."Job"("source", "sourceJobId");

-- CreateIndex
CREATE INDEX "MatchScore_score_idx" ON "jobmatch"."MatchScore"("score");

-- CreateIndex
CREATE UNIQUE INDEX "MatchScore_jobId_profileUpdatedAt_modelVersion_key" ON "jobmatch"."MatchScore"("jobId", "profileUpdatedAt", "modelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_key" ON "jobmatch"."Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "jobmatch"."Application"("status");

-- CreateIndex
CREATE INDEX "Application_sendAt_idx" ON "jobmatch"."Application"("sendAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_at_idx" ON "jobmatch"."AuditLog"("action", "at");

-- AddForeignKey
ALTER TABLE "jobmatch"."MatchScore" ADD CONSTRAINT "MatchScore_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobmatch"."Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobmatch"."Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobmatch"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobmatch"."AuditLog" ADD CONSTRAINT "AuditLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobmatch"."Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobmatch"."AuditLog" ADD CONSTRAINT "AuditLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "jobmatch"."Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

