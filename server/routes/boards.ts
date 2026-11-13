import { Router, Response } from 'express';
import { db } from '../db.js';
import { boardSnapshots } from '../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { SERVER_PLAN_LIMITS } from '../lib/tier.js';
import { resolveEffectiveUserPlan } from '../lib/orgLifecycle.js';

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
    res.json({ board: null });
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

    const effectivePlan = await resolveEffectiveUserPlan(userId);
    const tier = effectivePlan.tier;

    // Auto-delete completed tasks based on tier: Free 5 days, Premium 30 days, Pro never
    const autoDeleteDays = SERVER_PLAN_LIMITS.taskAutoDeleteDays[tier];
    if (Number.isFinite(autoDeleteDays) && Array.isArray(boardData.tasks)) {
      const cutoffMs = Date.now() - autoDeleteDays * 24 * 60 * 60 * 1000;
      boardData.tasks = boardData.tasks.filter((task: any) => {
        const isDone = Boolean(task.completed || task.status === 'completed');
        if (!isDone) return true;
        const ts = new Date(task.completedAt || task.updatedAt || task.createdAt || 0).getTime();
        return ts >= cutoffMs;
      });
    }

    // Active tasks limit check: Free 25, Premium 100, Pro unlimited
    const maxActiveTasks = SERVER_PLAN_LIMITS.activeTasks[tier];
    if (Number.isFinite(maxActiveTasks) && Array.isArray(boardData.tasks)) {
      const activeCount = boardData.tasks.filter((t: any) => !(t.completed || t.status === 'completed')).length;
      if (activeCount > maxActiveTasks) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: `${tier === 'free' ? 'Free' : 'Premium'} plan allows up to ${maxActiveTasks} active tasks. Upgrade to add more.`,
          limit: maxActiveTasks,
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