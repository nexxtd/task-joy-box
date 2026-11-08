-- Sharing for templates: a public template gets an unguessable share code that
-- anyone can redeem to copy the template's content; private templates have none.
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false NOT NULL;
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS share_code text;
ALTER TABLE note_templates ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false NOT NULL;
ALTER TABLE note_templates ADD COLUMN IF NOT EXISTS share_code text;

-- Codes are looked up exclusively, so keep them unique (when present).
CREATE UNIQUE INDEX IF NOT EXISTS task_templates_share_code_idx ON task_templates (share_code) WHERE share_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS note_templates_share_code_idx ON note_templates (share_code) WHERE share_code IS NOT NULL;
