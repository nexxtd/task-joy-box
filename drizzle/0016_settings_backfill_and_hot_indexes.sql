-- Backfill settings columns from 0005/0006 for DBs that missed them, plus
-- hot-FK indexes missing from the Drizzle-only path (full-table scans + slow
-- FK checks on sessions/boards/columns/tasks/labels/checklists/goals/notes/habits).
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "font_size" TEXT DEFAULT 'medium';
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "location" TEXT DEFAULT 'United States';
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "do_not_disturb_enabled" BOOLEAN DEFAULT false;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "do_not_disturb_start" TEXT DEFAULT '22:00';
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "do_not_disturb_end" TEXT DEFAULT '07:00';
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "upcoming_task_reminders" BOOLEAN DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "due_time_warning_enabled" BOOLEAN DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "overdue_task_alerts_enabled" BOOLEAN DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "daily_summary_enabled" BOOLEAN DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "habit_reminders_enabled" BOOLEAN DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "goal_deadline_alerts_enabled" BOOLEAN DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notification_sound_enabled" BOOLEAN DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_history" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
-- checklist_items.completed was TEXT 'false'; migrate to BOOLEAN.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_items' AND column_name='completed' AND data_type <> 'boolean') THEN
    ALTER TABLE "checklist_items" ALTER COLUMN "completed" TYPE BOOLEAN USING (CASE WHEN lower("completed") IN ('true','t','1','yes') THEN TRUE ELSE FALSE END);
    ALTER TABLE "checklist_items" ALTER COLUMN "completed" SET DEFAULT FALSE;
    ALTER TABLE "checklist_items" ALTER COLUMN "completed" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_token_idx" ON "sessions" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "boards_user_id_idx" ON "boards" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "columns_board_id_idx" ON "columns" ("board_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_board_id_idx" ON "tasks" ("board_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_column_id_idx" ON "tasks" ("column_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "labels_task_id_idx" ON "labels" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklists_task_id_idx" ON "checklists" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_items_checklist_id_idx" ON "checklist_items" ("checklist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_user_id_idx" ON "goals" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_project_id_idx" ON "goals" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_user_id_idx" ON "notes" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_project_id_idx" ON "notes" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habits_user_id_idx2" ON "habits" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habits_project_id_idx" ON "habits" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_id_idx" ON "transactions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whiteboard_items_whiteboard_id_idx" ON "whiteboard_items" ("whiteboard_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whiteboard_connections_whiteboard_id_idx" ON "whiteboard_connections" ("whiteboard_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_history_user_id_idx" ON "notification_history" ("user_id");
