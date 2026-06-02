import { db } from './db';
import { sql } from 'drizzle-orm';

export async function initDatabase() {
  try {
    console.log('Initializing database tables...');

    // Create board_snapshots table if it doesn't exist
    await db.execute(sql`CREATE TABLE IF NOT EXISTS board_snapshots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        snapshot TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

    // Create index on user_id for faster lookups
    await db.execute(sql`CREATE INDEX IF NOT EXISTS board_snapshots_user_id_idx ON board_snapshots(user_id)`);

    // Create habits table if it doesn't exist
    await db.execute(sql`CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Personal',
        color TEXT NOT NULL DEFAULT 'primary',
        streak INTEGER NOT NULL DEFAULT 0,
        completed_days TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

    // Create index on user_id for habits
    await db.execute(sql`CREATE INDEX IF NOT EXISTS habits_user_id_idx ON habits(user_id)`);

    // Create projects table if it doesn't exist
    await db.execute(sql`CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#6366f1',
        icon TEXT,
        archived BOOLEAN DEFAULT FALSE,
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

    // Create project_members table if it doesn't exist
    await db.execute(sql`CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, user_id)
      )`);

    // Create indexes for project_members
    await db.execute(sql`CREATE INDEX IF NOT EXISTS project_members_user_id_idx ON project_members(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS project_members_project_id_idx ON project_members(project_id)`);

    // Create project_columns table if it doesn't exist
    await db.execute(sql`CREATE TABLE IF NOT EXISTS project_columns (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        order_num INTEGER NOT NULL DEFAULT 0,
        color TEXT DEFAULT 'hsl(var(--muted-foreground))',
        icon TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

    // Create indexes for project_columns
    await db.execute(sql`CREATE INDEX IF NOT EXISTS project_columns_project_id_idx ON project_columns(project_id)`);

    // Create note_tags table if it doesn't exist
    await db.execute(sql`CREATE TABLE IF NOT EXISTS note_tags (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#6366f1',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

    // Create note_tag_assignments table if it doesn't exist
    await db.execute(sql`CREATE TABLE IF NOT EXISTS note_tag_assignments (
        id SERIAL PRIMARY KEY,
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES note_tags(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(note_id, tag_id)
      )`);

    // Create indexes for note_tags and note_tag_assignments
    await db.execute(sql`CREATE INDEX IF NOT EXISTS note_tags_user_id_idx ON note_tags(user_id)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS note_tags_user_name_idx ON note_tags(user_id, lower(name))`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS note_tag_assignments_note_id_idx ON note_tag_assignments(note_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS note_tag_assignments_tag_id_idx ON note_tag_assignments(tag_id)`);

    console.log('Database tables initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}