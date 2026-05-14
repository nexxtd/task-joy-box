-- Add habits table for persistent habit tracking
CREATE TABLE IF NOT EXISTS habits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Personal',
  color TEXT NOT NULL DEFAULT 'primary',
  streak INTEGER NOT NULL DEFAULT 0,
  completed_days TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS habits_user_id_idx ON habits(user_id);
