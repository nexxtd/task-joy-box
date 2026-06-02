import { Router } from 'express';
import { db } from '../db';
import { notificationHistory, userSettings } from '../../shared/schema';
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
      const inserted = await db
        .insert(userSettings)
        .values({ userId })
        .returning();

      settings = inserted[0];
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * Notification history
 * - Returns most recent items first
 */
router.get('/notification-history', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;

    const rows = await db.query.notificationHistory.findMany({
      where: eq(notificationHistory.userId, userId),
      orderBy: (notificationHistory, { desc }) => desc(notificationHistory.createdAt),
      limit: 50,
    });

    res.json({ notifications: rows });
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({ error: 'Failed to fetch notification history' });
  }
});

// Update user settings
router.patch('/', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;

    const {
      theme,
      fontFamily,
      fontSize,
      location,
      accentColor,
      accentHsl,
      language,
      smartAlerts,
      emailNotifs,

      // Notifications
      upcomingTaskReminders,
      dueTimeWarningEnabled,
      overdueTaskAlertsEnabled,
      dailySummaryEnabled,
      habitRemindersEnabled,
      goalDeadlineAlertsEnabled,
      notificationSoundEnabled,

      // DND
      doNotDisturbEnabled,
      doNotDisturbStart,
      doNotDisturbEnd,

      // Energy
      energyMorning,
      energyAfternoon,
      energyEvening,
      energyTrackerEnabled,
    } = req.body;

    const updated = await db
      .update(userSettings)
      .set({
        theme,
        fontFamily,
        fontSize,
        location,
        accentColor,
        accentHsl,
        language,
        smartAlerts,
        emailNotifs,

        upcomingTaskReminders,
        dueTimeWarningEnabled,
        overdueTaskAlertsEnabled,
        dailySummaryEnabled,
        habitRemindersEnabled,
        goalDeadlineAlertsEnabled,
        notificationSoundEnabled,

        doNotDisturbEnabled,
        doNotDisturbStart,
        doNotDisturbEnd,

        energyMorning,
        energyAfternoon,
        energyEvening,
        energyTrackerEnabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(userSettings.userId, userId))
      .returning();

    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
