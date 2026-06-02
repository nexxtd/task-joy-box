-- Migration to add foreign key constraint for projectId in tasks table
DO $$ 
BEGIN
    -- Check if the foreign key constraint already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_tasks_projectId' 
        AND table_name = 'tasks'
    ) THEN
        ALTER TABLE "tasks" ADD CONSTRAINT "fk_tasks_projectId" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL;
    END IF;
END $$;