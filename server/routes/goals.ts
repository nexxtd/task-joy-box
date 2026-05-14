import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { goals, type InsertGoal } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { encrypt, decrypt } from '../lib/encryption';

const router = Router();

// Get all goals for the current user
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userGoals = await db.select()
      .from(goals)
      .where(eq(goals.userId, req.userId!))
      .orderBy(desc(goals.updatedAt));

    const decrypted = userGoals.map(g => ({
      ...g,
      title: decrypt(g.title) ?? g.title,
      description: decrypt(g.description) ?? g.description,
    }));

    res.json(decrypted);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// Create a new goal
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, target, unit, color, timeframe, subGoals } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const [newGoal] = await db.insert(goals).values({
      userId: req.userId!,
      title: encrypt(title) ?? title,
      description: encrypt(description || '') ?? '',
      target: target || 100,
      unit: unit || 'units',
      color: color || 'hsl(var(--primary))',
      progress: 0,
      timeframe: timeframe || '1month',
      subGoals: subGoals || '[]',
    } as InsertGoal).returning();

    res.status(201).json({
      ...newGoal,
      title: decrypt(newGoal.title) ?? newGoal.title,
      description: decrypt(newGoal.description) ?? newGoal.description,
    });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// Update a goal
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const goalId = parseInt(req.params.id);
    const updates = { ...req.body };

    if (updates.title !== undefined) updates.title = encrypt(updates.title) ?? updates.title;
    if (updates.description !== undefined) updates.description = encrypt(updates.description) ?? updates.description;

    const [updatedGoal] = await db.update(goals)
      .set({
        ...updates,
        updatedAt: new Date().toISOString()
      })
      .where(and(eq(goals.id, goalId), eq(goals.userId, req.userId!)))
      .returning();

    if (!updatedGoal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({
      ...updatedGoal,
      title: decrypt(updatedGoal.title) ?? updatedGoal.title,
      description: decrypt(updatedGoal.description) ?? updatedGoal.description,
    });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// Delete a goal
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const goalId = parseInt(req.params.id);

    const result = await db.delete(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, req.userId!)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

export default router;
