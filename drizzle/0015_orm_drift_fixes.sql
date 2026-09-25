-- Consolidate ORM schema drift: project_chat_messages was created via raw SQL
-- in server/init-db.ts and used by server/routes/projects.ts, but had no
-- pgTable definition. This creates it for Drizzle-managed databases.
CREATE TABLE IF NOT EXISTS "project_chat_messages" (
  "id" SERIAL PRIMARY KEY,
  "project_id" INTEGER NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_chat_messages_project_id_idx" ON "project_chat_messages" ("project_id");
--> statement-breakpoint
-- Scope task attachments to their owner (fixes cross-user access by id guessing).
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "user_id" INTEGER REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachments_user_id_idx" ON "task_attachments" ("user_id");
--> statement-breakpoint
-- Fresh init-db.ts omitted milestones.completed; schema requires it.
ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "completed" BOOLEAN DEFAULT FALSE NOT NULL;
