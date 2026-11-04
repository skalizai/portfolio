-- Supabase exposes the public schema through its REST API. With row-level security on
-- and no policies, that API can read nothing here. Prisma connects as the table owner,
-- which bypasses RLS, so the app is unaffected.
ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatchScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SearchConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
