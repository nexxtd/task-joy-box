-- Add assigned_to_user_id column to tasks table
ALTER TABLE tasks ADD COLUMN assigned_to_user_id INTEGER REFERENCES users(id);