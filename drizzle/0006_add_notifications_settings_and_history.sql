-- Add missing Settings — Full Spec fields (Notifications + Notification History)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS upcoming_task_reminders BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS due_time_warning_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS overdue_task_alerts_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_summary_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS habit_reminders_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS goal_deadline_alerts_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_sound_enabled BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS notification_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
