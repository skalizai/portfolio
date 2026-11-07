-- When a job was included in the daily email, so that each job is emailed once.
ALTER TABLE "jobmatch"."Job" ADD COLUMN "notifiedAt" TIMESTAMP(3);
