-- Add energy level columns to user_settings table
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS energy_morning TEXT DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS energy_afternoon TEXT DEFAULT 'high',
ADD COLUMN IF NOT EXISTS energy_evening TEXT DEFAULT 'low';
