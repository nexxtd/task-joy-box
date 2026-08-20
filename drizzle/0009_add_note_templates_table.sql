CREATE TABLE IF NOT EXISTS note_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  color TEXT NOT NULL,
  project_id INTEGER,
  tags TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
