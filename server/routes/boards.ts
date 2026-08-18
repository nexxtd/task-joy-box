import { Router, Response } from 'express';
import { db } from '../db.js';
import { boardSnapshots, users } from '../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getSettingNumber } from '../lib/settings.js';

const router = Router();

// Get user's latest board snapshot
router.get('/snapshot', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const [snapshot] = await db.select()
      .from(boardSnapshots)
      .where(eq(boardSnapshots.userId, userId))
      .orderBy(desc(boardSnapshots.updatedAt))
      .limit(1);

    if (!snapshot) {
      return res.json({ board: null });
    }

    try {
      res.json({ board: JSON.parse(snapshot.snapshot) });
    } catch {
      console.error('Failed to parse board snapshot');
      res.json({ board: null });
    }
  } catch (error) {
    console.error('Failed to fetch board snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch board snapshot' });
  }
});

// Save board snapshot
router.post('/snapshot', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { boardData } = req.body;
    if (!boardData) {
      return res.status(400).json({ error: 'Invalid board data' });
    }

    const freeLimit = await getSettingNumber('free_tier_task_limit', 40);
    if (freeLimit > 0) {
      const [user] = await db.select({ subscriptionTier: users.subscriptionTier }).from(users).where(eq(users.id, userId)).limit(1);
      const incomingTasks = Array.isArray(boardData.tasks) ? boardData.tasks.length : 0;
      if ((user?.subscriptionTier || 'free') === 'free' && incomingTasks > freeLimit) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: `Free plan allows up to ${freeLimit} tasks. Upgrade to add more.`,
          limit: freeLimit,
        });
      }
    }

    // Delete old snapshots to keep only the latest (simple approach)
    await db.delete(boardSnapshots).where(eq(boardSnapshots.userId, userId));

    await db.insert(boardSnapshots).values({
      userId,
      snapshot: JSON.stringify(boardData),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save board snapshot:', error);
    res.status(500).json({ error: 'Failed to save board snapshot' });
  }
});

export default router;