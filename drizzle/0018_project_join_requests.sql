-- Project join requests: users ask to join, owner approves/denies before they become members.
CREATE TABLE IF NOT EXISTS "project_join_requests" (
  "id" SERIAL PRIMARY KEY,
  "project_id" INTEGER NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE("project_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "project_join_requests_project_id_idx" ON "project_join_requests"("project_id");
CREATE INDEX IF NOT EXISTS "project_join_requests_user_id_idx" ON "project_join_requests"("user_id");
