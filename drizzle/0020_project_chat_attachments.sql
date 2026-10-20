-- Project conversation: file/image attachments and task-or-note links.
-- attachment_data holds the base64 bytes so images survive ephemeral disks
-- (Render/Vercel wipe uploads/ on restart, which turned images white).
ALTER TABLE "project_chat_messages" ADD COLUMN IF NOT EXISTS "attachment_name" TEXT;
--> statement-breakpoint
ALTER TABLE "project_chat_messages" ADD COLUMN IF NOT EXISTS "attachment_type" TEXT;
--> statement-breakpoint
ALTER TABLE "project_chat_messages" ADD COLUMN IF NOT EXISTS "attachment_size" INTEGER;
--> statement-breakpoint
ALTER TABLE "project_chat_messages" ADD COLUMN IF NOT EXISTS "attachment_data" TEXT;
--> statement-breakpoint
-- linked_type: 'task' | 'note'. linked_title/linked_column are denormalised so
-- a bubble keeps its label even after the referenced item is deleted.
ALTER TABLE "project_chat_messages" ADD COLUMN IF NOT EXISTS "linked_type" TEXT;
--> statement-breakpoint
ALTER TABLE "project_chat_messages" ADD COLUMN IF NOT EXISTS "linked_id" TEXT;
--> statement-breakpoint
ALTER TABLE "project_chat_messages" ADD COLUMN IF NOT EXISTS "linked_title" TEXT;
--> statement-breakpoint
ALTER TABLE "project_chat_messages" ADD COLUMN IF NOT EXISTS "linked_column" TEXT;