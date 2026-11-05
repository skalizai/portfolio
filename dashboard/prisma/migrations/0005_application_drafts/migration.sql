-- The CV in structured form, so that tailoring can only reorder what's already there.
ALTER TABLE "jobmatch"."Profile" ADD COLUMN "cvStructured" JSONB;

-- The most drafts Claude may prepare per day, as a limit on API spending.
ALTER TABLE "jobmatch"."SearchConfig" ADD COLUMN "draftDailyCap" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "jobmatch"."Application"
  ADD COLUMN "tailoredCv" JSONB,
  ADD COLUMN "draftWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "inputTokens" INTEGER,
  ADD COLUMN "outputTokens" INTEGER;
