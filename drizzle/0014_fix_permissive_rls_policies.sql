-- Fix Supabase linter 0024 rls_policy_always_true on 16 tables.
-- Each table had a permissive `allow_all` policy (FOR ALL USING (true)
-- WITH CHECK (true)) that grants unrestricted PostgREST/anon access.
--
-- The app connects as the table owner via node-postgres (RLS bypassed) and
-- enforces auth in the Express middleware layer, so NO permissive USING(true)
-- policies are created here. With RLS enabled and no policies granting
-- anon/authenticated access, direct PostgREST access is denied while the API
-- server keeps working. This mirrors migration 0013 (auth tables), which the
-- linter already passes.
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widget_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- Remove the permissive policies flagged by the linter, plus legacy policies
-- from earlier migrations (0008, 0012) that are equally permissive
-- (FOR ALL USING (true) / FOR INSERT WITH CHECK (true)).
-- DROP IF EXISTS keeps this idempotent on fresh and existing databases.
DROP POLICY IF EXISTS allow_all ON activity_logs;
DROP POLICY IF EXISTS service_all ON activity_logs;
DROP POLICY IF EXISTS "API server can access activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "API server can insert activity_logs" ON activity_logs;
DROP POLICY IF EXISTS allow_all ON coupon_groups;
DROP POLICY IF EXISTS service_all ON coupon_groups;
DROP POLICY IF EXISTS "API server can access coupon_groups" ON coupon_groups;
DROP POLICY IF EXISTS "API server can insert coupon_groups" ON coupon_groups;
DROP POLICY IF EXISTS allow_all ON coupon_redemptions;
DROP POLICY IF EXISTS service_all ON coupon_redemptions;
DROP POLICY IF EXISTS "API server can access coupon_redemptions" ON coupon_redemptions;
DROP POLICY IF EXISTS "API server can insert coupon_redemptions" ON coupon_redemptions;
DROP POLICY IF EXISTS allow_all ON dashboard_widget_usage;
DROP POLICY IF EXISTS service_all ON dashboard_widget_usage;
DROP POLICY IF EXISTS "API server can access dashboard_widget_usage" ON dashboard_widget_usage;
DROP POLICY IF EXISTS "API server can insert dashboard_widget_usage" ON dashboard_widget_usage;
DROP POLICY IF EXISTS allow_all ON goal_snapshots;
DROP POLICY IF EXISTS service_all ON goal_snapshots;
DROP POLICY IF EXISTS "API server can access goal_snapshots" ON goal_snapshots;
DROP POLICY IF EXISTS "API server can insert goal_snapshots" ON goal_snapshots;
DROP POLICY IF EXISTS allow_all ON goal_tag_assignments;
DROP POLICY IF EXISTS service_all ON goal_tag_assignments;
DROP POLICY IF EXISTS "API server can access goal_tag_assignments" ON goal_tag_assignments;
DROP POLICY IF EXISTS "API server can insert goal_tag_assignments" ON goal_tag_assignments;
DROP POLICY IF EXISTS allow_all ON goal_tags;
DROP POLICY IF EXISTS service_all ON goal_tags;
DROP POLICY IF EXISTS "API server can access goal_tags" ON goal_tags;
DROP POLICY IF EXISTS "API server can insert goal_tags" ON goal_tags;
DROP POLICY IF EXISTS allow_all ON habit_snapshots;
DROP POLICY IF EXISTS service_all ON habit_snapshots;
DROP POLICY IF EXISTS "API server can access habit_snapshots" ON habit_snapshots;
DROP POLICY IF EXISTS "API server can insert habit_snapshots" ON habit_snapshots;
DROP POLICY IF EXISTS allow_all ON habit_tag_assignments;
DROP POLICY IF EXISTS service_all ON habit_tag_assignments;
DROP POLICY IF EXISTS "API server can access habit_tag_assignments" ON habit_tag_assignments;
DROP POLICY IF EXISTS "API server can insert habit_tag_assignments" ON habit_tag_assignments;
DROP POLICY IF EXISTS allow_all ON habit_tags;
DROP POLICY IF EXISTS service_all ON habit_tags;
DROP POLICY IF EXISTS "API server can access habit_tags" ON habit_tags;
DROP POLICY IF EXISTS "API server can insert habit_tags" ON habit_tags;
DROP POLICY IF EXISTS allow_all ON note_snapshots;
DROP POLICY IF EXISTS service_all ON note_snapshots;
DROP POLICY IF EXISTS "API server can access note_snapshots" ON note_snapshots;
DROP POLICY IF EXISTS "API server can insert note_snapshots" ON note_snapshots;
DROP POLICY IF EXISTS allow_all ON note_templates;
DROP POLICY IF EXISTS service_all ON note_templates;
DROP POLICY IF EXISTS "API server can access note_templates" ON note_templates;
DROP POLICY IF EXISTS "API server can insert note_templates" ON note_templates;
DROP POLICY IF EXISTS allow_all ON project_chat_messages;
DROP POLICY IF EXISTS service_all ON project_chat_messages;
DROP POLICY IF EXISTS "API server can access project_chat_messages" ON project_chat_messages;
DROP POLICY IF EXISTS "API server can insert project_chat_messages" ON project_chat_messages;
DROP POLICY IF EXISTS allow_all ON tags;
DROP POLICY IF EXISTS service_all ON tags;
DROP POLICY IF EXISTS "API server can access tags" ON tags;
DROP POLICY IF EXISTS "API server can insert tags" ON tags;
DROP POLICY IF EXISTS allow_all ON task_tag_assignments;
DROP POLICY IF EXISTS service_all ON task_tag_assignments;
DROP POLICY IF EXISTS "API server can access task_tag_assignments" ON task_tag_assignments;
DROP POLICY IF EXISTS "API server can insert task_tag_assignments" ON task_tag_assignments;
DROP POLICY IF EXISTS allow_all ON task_templates;
DROP POLICY IF EXISTS service_all ON task_templates;
DROP POLICY IF EXISTS "API server can access task_templates" ON task_templates;
DROP POLICY IF EXISTS "API server can insert task_templates" ON task_templates;

-- Lock out PostgREST roles where they exist (Supabase only).
-- Guarded so the migration also runs on plain Postgres (Render/local) where
-- the anon/authenticated roles do not exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE activity_logs FROM anon, authenticated;
    REVOKE ALL ON TABLE coupon_groups FROM anon, authenticated;
    REVOKE ALL ON TABLE coupon_redemptions FROM anon, authenticated;
    REVOKE ALL ON TABLE dashboard_widget_usage FROM anon, authenticated;
    REVOKE ALL ON TABLE goal_snapshots FROM anon, authenticated;
    REVOKE ALL ON TABLE goal_tag_assignments FROM anon, authenticated;
    REVOKE ALL ON TABLE goal_tags FROM anon, authenticated;
    REVOKE ALL ON TABLE habit_snapshots FROM anon, authenticated;
    REVOKE ALL ON TABLE habit_tag_assignments FROM anon, authenticated;
    REVOKE ALL ON TABLE habit_tags FROM anon, authenticated;
    REVOKE ALL ON TABLE note_snapshots FROM anon, authenticated;
    REVOKE ALL ON TABLE note_templates FROM anon, authenticated;
    REVOKE ALL ON TABLE project_chat_messages FROM anon, authenticated;
    REVOKE ALL ON TABLE tags FROM anon, authenticated;
    REVOKE ALL ON TABLE task_tag_assignments FROM anon, authenticated;
    REVOKE ALL ON TABLE task_templates FROM anon, authenticated;
  END IF;
END $$;
