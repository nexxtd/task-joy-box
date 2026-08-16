import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { deepFocusSessions, users } from '../../shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { getSetting } from '../lib/settings';
import { tierRank } from '../lib/tier';

const router = Router();

async function requireFocusTier(req: AuthRequest, res: any): Promise<boolean> {
  const requiredTier = (await getSetting('feature_deepfocus_tier', 'free')) || 'free';
  if (requiredTier === 'free') return true;
  const [user] = await db.select({ subscriptionTier: users.subscriptionTier, subscriptionStatus: users.subscriptionStatus })
    .from(users).where(eq(users.id, req.userId!)).limit(1);
  const userTier = user?.subscriptionTier?.toLowerCase() || 'free';
  const active = ['active', 'trialing'].includes(user?.subscriptionStatus || '');
  if (tierRank(userTier) < tierRank(requiredTier) || !active) {
    res.status(403).json({
      error: 'Feature locked',
      message: `${requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)} or higher subscription required for Deep Focus`,
      currentTier: userTier,
      requiredTier,
    });
    return false;
  }
  return true;
}

router.get('/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const sessions = await db
      .select()
      .from(deepFocusSessions)
      .where(eq(deepFocusSessions.userId, userId))
      .orderBy(desc(deepFocusSessions.createdAt));
    res.json(sessions);
  } catch (err) {
    console.error('Error fetching deep focus sessions:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.get('/sessions/today', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sessions = await db
      .select()
      .from(deepFocusSessions)
      .where(eq(deepFocusSessions.userId, userId))
      .orderBy(desc(deepFocusSessions.createdAt));

    const today = todayStart.toISOString().split('T')[0];
    const todaySessions = sessions.filter(s => s.createdAt.startsWith(today));

    const totalMinutes = todaySessions.reduce((acc, s) => acc + s.durationMinutes, 0);
    res.json({ sessions: todaySessions.length, minutes: totalMinutes });
  } catch (err) {
    console.error('Error fetching today deep focus stats:', err);
    res.status(500).json({ error: 'Failed to fetch today stats' });
  }
});

router.post('/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireFocusTier(req, res))) return;
    const userId = req.userId!;
    const { taskId, taskName, durationMinutes, completed } = req.body;

    if (!taskName || typeof durationMinutes !== 'number') {
      return res.status(400).json({ error: 'taskName and durationMinutes are required' });
    }

    const [session] = await db
      .insert(deepFocusSessions)
      .values({
        userId,
        taskId: taskId || null,
        taskName,
        durationMinutes,
        completed: !!completed,
      })
      .returning();

    res.status(201).json(session);
  } catch (err) {
    console.error('Error saving deep focus session:', err);
    res.status(500).json({ error: 'Failed to save session' });
  }
});

export default router;
