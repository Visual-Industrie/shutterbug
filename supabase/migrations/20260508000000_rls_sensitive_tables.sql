-- Block anon key access to sensitive tables.
-- No policies are added, so the anon role gets nothing.
-- The postgres superuser role (used by the Vercel API via DATABASE_URL) bypasses RLS.
ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
