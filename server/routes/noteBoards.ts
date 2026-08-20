import { Router, Response } from 'express';
import { db } from '../db.js';
import { noteSnapshots, users } from '../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get board snapshot
router.get('/snapshot', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await db.select()
      .from(noteSnapshots)
      .where(eq(noteSnapshots.userId, req.userId!))
      .orderBy(desc(noteSnapshots.updatedAt))
      .limit(1);
      
    if (snapshot.length === 0) {
      return res.json(null);
    }
    
    // Parse the JSON string back to an object
    const boardData = JSON.parse(snapshot[0].snapshot);
    res.json(boardData);
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
    
    const result = await db.insert(noteSnapshots)
      .values({
        userId: req.userId!,
        snapshot: snapshotString
      })
      .returning();
      
    // Optional: cleanup old snapshots to save space
    const userSnapshots = await db.select({ id: noteSnapshots.id })
      .from(noteSnapshots)
      .where(eq(noteSnapshots.userId, req.userId!))
      .orderBy(desc(noteSnapshots.updatedAt));
      
    if (userSnapshots.length > 10) {
      const idsToDelete = userSnapshots.slice(10).map(s => s.id);
      if (idsToDelete.length > 0) {
        for (const id of idsToDelete) {
          await db.delete(noteSnapshots).where(eq(noteSnapshots.id, id));
        }
      }
    }
      
    res.json({ success: true, id: result[0].id });
  } catch (error) {
    console.error('Failed to save board snapshot:', error);
    res.status(500).json({ error: 'Failed to save board snapshot' });
  }
});

export default router;
