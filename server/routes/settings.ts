import { Router } from 'express';
import { db } from '../db.js';
import { users, userSettings, type UpdateUserSettings } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Get user settings
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    let settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });

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
    const { theme, fontFamily, accentColor, accentHsl, language, smartAlerts, emailNotifs, energyMorning, energyAfternoon, energyEvening, energyTrackerEnabled } = req.body;

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

    const [updatedSettings] = await db.update(userSettings)
      .set({
        theme,
        fontFamily,
        accentColor,
        accentHsl,
        language,
        smartAlerts,
        emailNotifs,
        energyMorning,
        energyAfternoon,
        energyEvening,
        energyTrackerEnabled,
        updatedAt: new Date().toISOString(),
      } as UpdateUserSettings as any)
      .where(eq(userSettings.userId, userId))
      .returning();

    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;