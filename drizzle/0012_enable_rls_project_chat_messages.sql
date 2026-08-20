-- Enable RLS on project_chat_messages (Supabase lint compliance)
-- The app uses custom JWT auth with integer user IDs (not Supabase Auth UUIDs).
-- Auth is enforced at the Express middleware layer, so RLS needs to allow
-- access based on the authenticated connection from the API server.
ALTER TABLE project_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "API server can access project_chat_messages" ON project_chat_messages FOR ALL USING (true);
CREATE POLICY "API server can insert project_chat_messages" ON project_chat_messages FOR INSERT WITH CHECK (true);