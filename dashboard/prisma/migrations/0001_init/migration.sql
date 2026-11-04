-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApplyChannel" AS ENUM ('EMAIL', 'ATS_FORM', 'LINKEDIN_EASY_APPLY', 'COMPANY_SITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('STRONG', 'GOOD', 'WEAK', 'REJECT');

-- CreateEnum
CREATE TYPE "SeniorityFit" AS ENUM ('under', 'fit', 'over');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED', 'OPENED_EXTERNALLY', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('ACTIVE', 'SAVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "json" JSONB NOT NULL,
    "cvFileUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
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
    "applyChannel" "ApplyChannel" NOT NULL DEFAULT 'UNKNOWN',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT,
    "postedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeHash" TEXT NOT NULL,
    "rawJson" JSONB,
    "state" "JobState" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchScore" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "keyRequirements" TEXT[],
    "redFlags" TEXT[],
    "seniorityFit" "SeniorityFit" NOT NULL,
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
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" "ApplyChannel" NOT NULL,
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
CREATE TABLE "SearchConfig" (
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
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "jobId" TEXT,
    "applicationId" TEXT,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeHash_key" ON "Job"("dedupeHash");

-- CreateIndex
CREATE INDEX "Job_company_postedAt_idx" ON "Job"("company", "postedAt");

-- CreateIndex
CREATE INDEX "Job_state_postedAt_idx" ON "Job"("state", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_source_sourceJobId_key" ON "Job"("source", "sourceJobId");

-- CreateIndex
CREATE INDEX "MatchScore_score_idx" ON "MatchScore"("score");

-- CreateIndex
CREATE UNIQUE INDEX "MatchScore_jobId_profileUpdatedAt_modelVersion_key" ON "MatchScore"("jobId", "profileUpdatedAt", "modelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_key" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_sendAt_idx" ON "Application"("sendAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_at_idx" ON "AuditLog"("action", "at");

-- AddForeignKey
ALTER TABLE "MatchScore" ADD CONSTRAINT "MatchScore_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

