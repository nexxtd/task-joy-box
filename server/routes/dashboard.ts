import { Router, Response } from 'express';
import { db } from '../db';
import { dashboardWidgetUsage } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Record dashboard widget usage for the current user.
// Body: { widgetTypes: string[] } - the set of widget types currently placed on the dashboard.
router.post('/widget-usage', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { widgetTypes } = req.body;
    if (!Array.isArray(widgetTypes)) {
      return res.status(400).json({ error: 'widgetTypes must be an array' });
    }

    const uniqueTypes = [...new Set(widgetTypes.map((w: any) => String(w?.type || w)).filter(Boolean))];

    for (const widgetType of uniqueTypes) {
      const existing = await db.select({ id: dashboardWidgetUsage.id })
        .from(dashboardWidgetUsage)
        .where(and(eq(dashboardWidgetUsage.userId, userId), eq(dashboardWidgetUsage.widgetType, widgetType)))
        .limit(1);

      if (existing.length > 0) {
        await db.update(dashboardWidgetUsage)
          .set({ count: sql`count + 1` })
          .where(eq(dashboardWidgetUsage.id, existing[0].id));
      } else {
        await db.insert(dashboardWidgetUsage).values({ userId, widgetType, count: 1 });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to record widget usage:', error);
    res.status(500).json({ error: 'Failed to record widget usage' });
  }
});

export default router;
