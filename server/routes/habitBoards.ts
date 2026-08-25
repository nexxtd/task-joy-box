import { Router, Response } from 'express';
import { db } from '../db.js';
import { habitSnapshots, users } from '../../shared/schema.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get board snapshot
router.get('/snapshot', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await db.select()
      .from(habitSnapshots)
      .where(eq(habitSnapshots.userId, req.userId!))
      .orderBy(desc(habitSnapshots.updatedAt))
      .limit(1);
      
    if (snapshot.length === 0) {
      return res.json({ board: null });
    }
    try {
      const boardData = JSON.parse(snapshot[0].snapshot);
      res.json({ board: boardData });
    } catch {
      console.error('Failed to parse habit board snapshot');
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
    const { boardData } = req.body;
    
    // Save as JSON string
    const snapshotString = JSON.stringify(boardData);
    
    const result = await db.insert(habitSnapshots)
      .values({
        userId: req.userId!,
        snapshot: snapshotString
      })
      .returning();
      
    // Optional: cleanup old snapshots to save space
    const userSnapshots = await db.select({ id: habitSnapshots.id })
      .from(habitSnapshots)
      .where(eq(habitSnapshots.userId, req.userId!))
      .orderBy(desc(habitSnapshots.updatedAt));
      
    if (userSnapshots.length > 10) {
      const idsToDelete = userSnapshots.slice(10).map(s => s.id);
      if (idsToDelete.length > 0) {
        await db.delete(habitSnapshots).where(inArray(habitSnapshots.id, idsToDelete));
      }
    }
      
    res.json({ success: true, id: result[0].id });
  } catch (error) {
    console.error('Failed to save board snapshot:', error);
    res.status(500).json({ error: 'Failed to save board snapshot' });
  }
});

export default router;
