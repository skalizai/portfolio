-- Backstop in case this schema is ever exposed through the Supabase REST API. With
-- row-level security on and no policies, that API can read nothing here. Prisma connects
-- as the table owner, which bypasses RLS, so the app is unaffected.
ALTER TABLE "jobmatch"."Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobmatch"."Job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobmatch"."MatchScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobmatch"."Application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobmatch"."SearchConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobmatch"."AuditLog" ENABLE ROW LEVEL SECURITY;
