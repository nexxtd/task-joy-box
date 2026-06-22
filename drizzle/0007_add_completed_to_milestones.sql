-- Add completed column to milestones table
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false NOT NULL;
