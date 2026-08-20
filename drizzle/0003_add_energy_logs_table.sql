-- Migration to add energy_logs table
CREATE TABLE IF NOT EXISTS energy_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL, -- Format: YYYY-MM-DD
  time_slot TEXT NOT NULL, -- 'morning', 'midday', 'afternoon'
  energy_level TEXT NOT NULL, -- 'low', 'medium', 'high'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_energy_logs_user_date ON energy_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_energy_logs_user_timeslot ON energy_logs(user_id, time_slot);

-- Add energy_tracker_enabled column to user_settings if not exists
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS energy_tracker_enabled BOOLEAN DEFAULT TRUE;