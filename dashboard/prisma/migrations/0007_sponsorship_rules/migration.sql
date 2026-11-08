-- Per-country rules, such as "only show jobs that mention visa sponsorship". Null until first saved,
-- so the countries already listed on the profile keep working until then.
ALTER TABLE "jobmatch"."SearchConfig" ADD COLUMN "sponsorshipRules" JSONB;
