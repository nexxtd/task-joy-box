import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { habits } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { Request, Response, Router } from 'express';

const router = Router();

// Calculate actual streak from completed days
function calculateStreak(completedDays: string[]): number {
  if (completedDays.length === 0) return 0;
  
  // Convert date strings to dates and sort in descending order
  const sortedDates = completedDays
    .map(dateStr => {
      const date = new Date(dateStr);
      // Set to midnight to ensure proper day comparison
      date.setHours(0, 0, 0, 0);
      return date;
    })
    .sort((a, b) => b.getTime() - a.getTime());
  
  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0); // Start with today at midnight
  
  // Go through each completed date in descending order
  for (const completedDate of sortedDates) {
    const checkDate = new Date(completedDate);
    checkDate.setHours(0, 0, 0, 0);
    
    // Calculate the difference in days
    const diffTime = Math.abs(currentDate.getTime() - checkDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // If the date is consecutive to current date, increase streak
    if (diffDays === 0) { // Same day
      streak++;
      currentDate.setDate(currentDate.getDate() - 1); // Move to yesterday
    } else if (diffDays === 1) { // One day apart (yesterday)
      streak++;
      currentDate = new Date(checkDate); // Set current date to this date
      currentDate.setDate(currentDate.getDate() - 1); // Move to yesterday
    } else {
      // If more than a day apart, streak is broken
      break;
    }
  }
  
  return streak;
}

// Get all habits for user
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitsList = await db
      .select()
      .from(habits)
      .where(eq(habits.userId, req.userId!))
      .orderBy(desc(habits.createdAt));
    
    res.json({ habits: habitsList });
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
    
    // Insert the new habit
    const [habit] = await db
      .insert(habits)
      .values({
        userId: req.userId!,
        title,
        category: category || 'Personal',
        color: color || 'primary',
        streak: 0,
        completedDays: [],  // Changed to empty array
      })
      .returning();
    
    res.json({ habit });
  } catch (error) {
    console.error('Create habit error:', error);
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

    // Since completedDays is already an array, no need to parse it
    const finalCompletedDays = updatedHabit.completedDays || [];
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

// Update habit completion
router.patch('/:habitId/toggle', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitId = parseInt(req.params.habitId, 10);
    const { completed } = req.body;
    
    // Get the current habit
    const [currentHabit] = await db
      .select()
      .from(habits)
      .where(eq(habits.id, habitId));
    
    if (!currentHabit) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    if (currentHabit.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to update this habit' });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const parsedCompletedDays = Array.isArray(currentHabit.completedDays) 
      ? currentHabit.completedDays 
      : [];

    let newCompletedDays = parsedCompletedDays;
    let newStreak = currentHabit.streak;

    if (completed) {
      // Mark as completed today
      if (!parsedCompletedDays.includes(today)) {
        newCompletedDays = [...parsedCompletedDays, today];
      }
      newStreak = calculateStreak(newCompletedDays);
    } else {
      // Mark as not completed today
      newCompletedDays = parsedCompletedDays.filter(date => date !== today);
      newStreak = calculateStreak(newCompletedDays);
    }

    // Update the habit with the new completed days array
    const [updatedHabit] = await db
      .update(habits)
      .set({
        completedDays: newCompletedDays, // Store as array directly
        streak: newStreak
      })
      .where(eq(habits.id, habitId))
      .returning();

    // Since completedDays is already an array, no need to parse it
    const finalCompletedDays = updatedHabit.completedDays || [];
    const finalStreak = calculateStreak(finalCompletedDays);

    res.json({
      ...updatedHabit,
      completedDays: finalCompletedDays,
      streak: finalStreak,
    });
  } catch (error) {
    console.error('Toggle habit error:', error);
    res.status(500).json({ error: 'Failed to toggle habit' });
  }
});

// Get a specific habit
router.get('/:habitId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitId = parseInt(req.params.habitId, 10);
    
    const [habitData] = await db
      .select()
      .from(habits)
      .where(eq(habits.id, habitId));
    
    if (!habitData) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    if (habitData.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to view this habit' });
    }
    
    // completedDays is already an array
    const completedDays = habitData.completedDays || [];
    
    res.json({ 
      habit: {
        ...habitData,
        completedDays
      } 
    });
  } catch (error) {
    console.error('Get habit error:', error);
    res.status(500).json({ error: 'Failed to get habit' });
  }
});

// Complete a habit for today
router.post('/:id/complete', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitId = parseInt(req.params.id);
    const today = new Date().toISOString().split('T')[0];

    const [habit] = await db
      .select()
      .from(habits)
      .where(eq(habits.id, habitId));

    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    // completedDays is already an array, not a JSON string
    const parsedCompletedDays = Array.isArray(habit.completedDays) 
      ? habit.completedDays 
      : [];

    if (parsedCompletedDays.includes(today)) {
      return res.status(400).json({ error: 'Habit already completed for today' });
    }

    const newStreak = calculateStreak([...parsedCompletedDays, today]);

    // Update habit completion - store as array directly
    const [updatedHabit] = await db
      .update(habits)
      .set({
        completedDays: [...parsedCompletedDays, today], // Store as array directly
        streak: newStreak
      })
      .where(eq(habits.id, habitId))
      .returning();

    // Create final result with the updated data
    const finalCompletedDays = updatedHabit.completedDays || [];
    const finalStreak = calculateStreak(finalCompletedDays);

    res.json({
      ...updatedHabit,
      completedDays: finalCompletedDays,
      streak: finalStreak,
    });
  } catch (error) {
    console.error('Complete habit error:', error);
    res.status(500).json({ error: 'Failed to complete habit' });
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
