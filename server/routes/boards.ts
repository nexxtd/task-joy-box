import { Router, Response } from 'express';
import { db } from '../db';
import { boardSnapshots } from '../../shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';

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

    res.json({ board: JSON.parse(snapshot.snapshot) });
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
