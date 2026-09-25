-- White images after refresh: uploads/ on disk is ephemeral on Render/Vercel.
-- Store file bytes in Postgres so GET /api/attachments/file/:id survives restarts.
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "file_data" TEXT;
