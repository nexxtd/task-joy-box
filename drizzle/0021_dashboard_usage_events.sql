CREATE TABLE IF NOT EXISTS dashboard_usage_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS dashboard_usage_events_user_date_idx ON dashboard_usage_events(user_id, created_at);
