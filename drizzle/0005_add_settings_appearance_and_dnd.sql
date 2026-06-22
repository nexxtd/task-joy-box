-- Add missing Settings — Full Spec fields (Appearance + DND)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS font_size TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'United States',
  ADD COLUMN IF NOT EXISTS do_not_disturb_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_disturb_start TEXT DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS do_not_disturb_end TEXT DEFAULT '07:00';

-- Existing columns in this project already cover: theme, font_family, accent_color, accent_hsl, language,
-- smart_alerts, email_notifs, energy_morning/afternoon/evening, energy_tracker_enabled.
