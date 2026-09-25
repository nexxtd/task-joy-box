-- Enable RLS on server-only auth tables (Supabase linter 0013 rls_disabled_in_public,
-- 0023 sensitive_columns_exposed). The app connects as the table owner via
-- node-postgres (RLS bypassed), so NO permissive USING(true) policies are created.
-- With RLS enabled and no policies granting anon/authenticated access, direct
-- PostgREST access is denied while the API server keeps working.
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE two_factor_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Remove any permissive policies that may have been created by earlier migrations
-- (defensive: these tables never had policies, but DROP IF EXISTS is idempotent).
DROP POLICY IF EXISTS "API server can access email_verification_tokens" ON email_verification_tokens;
DROP POLICY IF EXISTS "API server can insert email_verification_tokens" ON email_verification_tokens;
DROP POLICY IF EXISTS "API server can access pending_signups" ON pending_signups;
DROP POLICY IF EXISTS "API server can insert pending_signups" ON pending_signups;
DROP POLICY IF EXISTS "API server can access two_factor_tokens" ON two_factor_tokens;
DROP POLICY IF EXISTS "API server can insert two_factor_tokens" ON two_factor_tokens;
DROP POLICY IF EXISTS "API server can access password_reset_tokens" ON password_reset_tokens;
DROP POLICY IF EXISTS "API server can insert password_reset_tokens" ON password_reset_tokens;
DROP POLICY IF EXISTS "API server can access sessions" ON sessions;
DROP POLICY IF EXISTS "API server can insert sessions" ON sessions;

-- Lock out PostgREST roles where they exist (Supabase only).
-- Guarded so the migration also runs on plain Postgres (Render/local) where
-- the anon/authenticated roles do not exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE email_verification_tokens FROM anon, authenticated;
    REVOKE ALL ON TABLE pending_signups FROM anon, authenticated;
    REVOKE ALL ON TABLE two_factor_tokens FROM anon, authenticated;
    REVOKE ALL ON TABLE password_reset_tokens FROM anon, authenticated;
    REVOKE ALL ON TABLE sessions FROM anon, authenticated;
  END IF;
END $$;
