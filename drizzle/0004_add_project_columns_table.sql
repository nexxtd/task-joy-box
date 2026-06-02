-- Migration to add project_columns table
CREATE TABLE IF NOT EXISTS "project_columns" (
    "id" SERIAL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "orderNum" INTEGER NOT NULL,
    "color" VARCHAR(255) DEFAULT 'hsl(var(--muted-foreground))',
    "icon" VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "fk_project_columns_projectId" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
);

-- Update tasks table to add foreign key constraint for projectId
ALTER TABLE "tasks" ADD CONSTRAINT "fk_tasks_projectId" FOREIGN KEY ("projectId") REFERENCES "projects"("id");