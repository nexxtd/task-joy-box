import { Router } from 'express';
import { db } from '../db.js';
import { users, userSettings, type UpdateUserSettings } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { normalizeLanguageCode } from '../lib/language.js';

const router = Router();

// Get user settings
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    let [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);

    if (!settings) {
      // Create default settings if they don't exist
      const [newSettings] = await db.insert(userSettings).values({
        userId,
      }).returning();
      settings = newSettings;
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update user settings
router.patch('/', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { theme, fontFamily, accentColor, accentHsl, language, dashboardShortcut, smartAlerts, emailNotifs, energyMorning, energyAfternoon, energyEvening, energyTrackerEnabled } = req.body;

    // Only language CODES (en, zh, ...) are stored on the account — never
    // display names ("中文"), which broke non-Latin locales client-side.
    // Legacy name values are normalized so old accounts self-heal.
    const languageCode = language !== undefined ? normalizeLanguageCode(language) : undefined;

    const allowedAccents = new Set(['#000000', '#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#DB2777'].map(s => s.toLowerCase()));
    const isCustomAccent = accentColor !== undefined && !allowedAccents.has(String(accentColor).toLowerCase());
    const isCustomFont = fontFamily !== undefined && fontFamily !== 'Inter';
    const isCustomTheme = theme !== undefined && theme !== 'system' && theme !== 'light';
    if (isCustomAccent || isCustomFont || isCustomTheme) {
      const [user] = await db.select({ subscriptionTier: users.subscriptionTier }).from(users).where(eq(users.id, userId)).limit(1);
      const tier = (user?.subscriptionTier || 'free').toLowerCase();
      const isPaid = tier === 'pro' || tier === 'premium';
      if (!isPaid) {
        return res.status(403).json({ error: 'Custom colors, fonts and themes require Premium or Pro. Please upgrade.' });
      }
    }

    const VALID_SHORTCUTS = new Set(['/projects', '/tasks', '/insights', '/notes', '/calendar', '/ai-chat', '/support', '/settings']);
    const cleanShortcut = dashboardShortcut !== undefined && VALID_SHORTCUTS.has(String(dashboardShortcut)) ? String(dashboardShortcut) : undefined;

    const buildSet = (withShortcut: boolean) => ({
        ...(theme !== undefined ? { theme } : {}),
        ...(fontFamily !== undefined ? { fontFamily } : {}),
        ...(accentColor !== undefined ? { accentColor } : {}),
        ...(accentHsl !== undefined ? { accentHsl } : {}),
        ...(languageCode !== undefined ? { language: languageCode } : {}),
        ...(withShortcut && cleanShortcut !== undefined ? { dashboardShortcut: cleanShortcut } : {}),
        ...(smartAlerts !== undefined ? { smartAlerts } : {}),
        ...(emailNotifs !== undefined ? { emailNotifs } : {}),
        ...(energyMorning !== undefined ? { energyMorning } : {}),
        ...(energyAfternoon !== undefined ? { energyAfternoon } : {}),
        ...(energyEvening !== undefined ? { energyEvening } : {}),
        ...(energyTrackerEnabled !== undefined ? { energyTrackerEnabled } : {}),
        updatedAt: new Date().toISOString(),
      } as UpdateUserSettings as any);

    let updatedSettings: any = null;
    try {
      [updatedSettings] = await db.update(userSettings)
        .set(buildSet(true))
        .where(eq(userSettings.userId, userId))
        .returning();
    } catch (e: any) {
      // Old DBs without the dashboard_shortcut column (pre-migration):
      // retry without it so language/other saves never fail.
      if (cleanShortcut !== undefined && String(e?.message || '').includes('dashboard_shortcut')) {
        [updatedSettings] = await db.update(userSettings)
          .set(buildSet(false))
          .where(eq(userSettings.userId, userId))
          .returning();
      } else {
        throw e;
      }
    }

    if (!updatedSettings) {
      try {
        const [created] = await db.insert(userSettings).values({
          userId,
          ...(theme !== undefined ? { theme } : {}),
          ...(fontFamily !== undefined ? { fontFamily } : {}),
          ...(accentColor !== undefined ? { accentColor } : {}),
          ...(accentHsl !== undefined ? { accentHsl } : {}),
          ...(languageCode !== undefined ? { language: languageCode } : {}),
          ...(cleanShortcut !== undefined ? { dashboardShortcut: cleanShortcut } : {}),
          ...(smartAlerts !== undefined ? { smartAlerts } : {}),
          ...(emailNotifs !== undefined ? { emailNotifs } : {}),
          ...(energyMorning !== undefined ? { energyMorning } : {}),
          ...(energyAfternoon !== undefined ? { energyAfternoon } : {}),
          ...(energyEvening !== undefined ? { energyEvening } : {}),
          ...(energyTrackerEnabled !== undefined ? { energyTrackerEnabled } : {}),
        } as any).returning();
        return res.json(created);
      } catch (e: any) {
        if (cleanShortcut !== undefined && String(e?.message || '').includes('dashboard_shortcut')) {
          const [created] = await db.insert(userSettings).values({
            userId,
            ...(theme !== undefined ? { theme } : {}),
            ...(fontFamily !== undefined ? { fontFamily } : {}),
            ...(accentColor !== undefined ? { accentColor } : {}),
            ...(accentHsl !== undefined ? { accentHsl } : {}),
            ...(languageCode !== undefined ? { language: languageCode } : {}),
            ...(smartAlerts !== undefined ? { smartAlerts } : {}),
            ...(emailNotifs !== undefined ? { emailNotifs } : {}),
            ...(energyMorning !== undefined ? { energyMorning } : {}),
            ...(energyAfternoon !== undefined ? { energyAfternoon } : {}),
            ...(energyEvening !== undefined ? { energyEvening } : {}),
            ...(energyTrackerEnabled !== undefined ? { energyTrackerEnabled } : {}),
          } as any).returning();
          return res.json(created);
        }
        throw e;
      }
    }
    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;