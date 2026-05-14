import { Router } from 'express';
import { db } from '../db';
import { userSettings, type UpdateUserSettings } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';

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
    const { theme, fontFamily, accentColor, accentHsl, language, smartAlerts, emailNotifs, energyMorning, energyAfternoon, energyEvening } = req.body;

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
