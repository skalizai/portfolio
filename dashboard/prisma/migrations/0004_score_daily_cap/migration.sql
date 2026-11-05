-- The most jobs Claude may score per day, as a limit on API spending.
ALTER TABLE "jobmatch"."SearchConfig" ADD COLUMN "scoreDailyCap" INTEGER NOT NULL DEFAULT 50;
