import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { habits, type InsertHabit } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

// Calculate actual streak from completed days
function calculateStreak(completedDays: string[]): number {
  if (completedDays.length === 0) return 0;

  // Normalize all completed days to date-only strings (UTC) and deduplicate
  const completedSet = new Set(
    completedDays.map(d => {
      const dt = new Date(d);
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    })
  );

  // Get today's date in UTC
  const now = new Date();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  // Start counting from today if completed today, otherwise from yesterday
  let checkDate = new Date(now);
  let startedCounting = false;
  let streak = 0;

  // Check if completed today to start counting
  if (completedSet.has(todayStr)) {
    startedCounting = true;
  } else {
    // Check yesterday - if not completed yesterday either, streak is 0
    checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    const yesterdayStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`;
    if (!completedSet.has(yesterdayStr)) {
      return 0;
    }
    startedCounting = true;
  }

  // Count consecutive days
  checkDate = new Date(now);
  if (!completedSet.has(todayStr)) {
    checkDate.setUTCDate(checkDate.getUTCDate() - 1);
  }

  while (startedCounting) {
    const dateStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`;
    if (completedSet.has(dateStr)) {
      streak++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

// Get all habits for the current user
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userHabits = await db.select()
      .from(habits)
      .where(eq(habits.userId, req.userId!))
      .orderBy(desc(habits.updatedAt));

    res.json(userHabits.map(h => {
      const completedDays = JSON.parse(h.completedDays || '[]');
      const actualStreak = calculateStreak(completedDays);
      
      return {
        ...h,
        completedDays,
        streak: actualStreak,
      };
    }));
  } catch (error) {
    console.error('Error fetching habits:', error);
    res.status(500).json({ error: 'Failed to fetch habits' });
  }
});

// Create a new habit
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, category, color } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const [newHabit] = await db.insert(habits).values({
      userId: req.userId!,
      title,
      category: category || 'Personal',
      color: color || 'primary',
      streak: 0,
      completedDays: '[]',
    } as InsertHabit).returning();

    res.status(201).json({
      ...newHabit,
      completedDays: [],
    });
  } catch (error) {
    console.error('Error creating habit:', error);
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

// Update a habit (toggle completion, update streak, etc.)
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitId = parseInt(req.params.id);
    const { completedDays, title, category, color } = req.body;

    const updates: any = {};
    if (completedDays !== undefined) {
      updates.completedDays = JSON.stringify(completedDays);
      // Calculate and update streak based on actual completed days
      updates.streak = calculateStreak(completedDays);
    }
    if (title !== undefined) updates.title = title;
    if (category !== undefined) updates.category = category;
    if (color !== undefined) updates.color = color;
    updates.updatedAt = new Date().toISOString();

    const [updatedHabit] = await db.update(habits)
      .set(updates)
      .where(and(eq(habits.id, habitId), eq(habits.userId, req.userId!)))
      .returning();

    if (!updatedHabit) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    const finalCompletedDays = JSON.parse(updatedHabit.completedDays || '[]');
    const finalStreak = calculateStreak(finalCompletedDays);

    res.json({
      ...updatedHabit,
      completedDays: finalCompletedDays,
      streak: finalStreak,
    });
  } catch (error) {
    console.error('Error updating habit:', error);
    res.status(500).json({ error: 'Failed to update habit' });
  }
});

// Delete a habit
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitId = parseInt(req.params.id);

    const result = await db.delete(habits)
      .where(and(eq(habits.id, habitId), eq(habits.userId, req.userId!)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    res.json({ message: 'Habit deleted successfully' });
  } catch (error) {
    console.error('Error deleting habit:', error);
    res.status(500).json({ error: 'Failed to delete habit' });
  }
});

export default router;
