import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { habits, tags, habitTagAssignments, activityLogs, type InsertHabit } from '../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

const router = Router();

const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

function calculateStreak(completedDays: string[]): number {
  if (completedDays.length === 0) return 0;
  const completedSet = new Set(
    completedDays.map(d => {
      const dt = new Date(d);
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    })
  );
  const now = new Date();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  let checkDate = new Date(now);
  let streak = 0;
  if (!completedSet.has(todayStr)) {
    checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    const yesterdayStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`;
    if (!completedSet.has(yesterdayStr)) return 0;
  }
  checkDate = new Date(now);
  if (!completedSet.has(todayStr)) checkDate.setUTCDate(checkDate.getUTCDate() - 1);
  while (true) {
    const dateStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`;
    if (completedSet.has(dateStr)) { streak++; checkDate.setUTCDate(checkDate.getUTCDate() - 1); } else { break; }
  }
  return streak;
}

async function loadHabitsWithTags(userId: number) {
  const userHabits = await db.select().from(habits).where(eq(habits.userId, userId)).orderBy(desc(habits.updatedAt));
  const allTags = await db.select().from(tags).where(eq(tags.userId, userId));
  const allAssignments = await db.select().from(habitTagAssignments);

  const tagMap = new Map(allAssignments.map(a => [a.habitId, a.tagId]));
  const tagsByHabit = new Map<number, typeof allTags>();
  for (const a of allAssignments) {
    if (!tagsByHabit.has(a.habitId)) tagsByHabit.set(a.habitId, []);
    const tag = allTags.find(t => t.id === a.tagId);
    if (tag) tagsByHabit.get(a.habitId)!.push(tag);
  }

  return {
    habits: userHabits.map(h => ({
      ...h,
      completedDays: JSON.parse(h.completedDays || '[]'),
      streak: calculateStreak(JSON.parse(h.completedDays || '[]')),
      tags: tagsByHabit.get(h.id) || [],
    })),
    tags: allTags,
  };
}

async function logActivity(userId: number, entityType: string, entityId: number, action: string, details?: string) {
  await db.insert(activityLogs).values({ userId, entityType, entityId, action, details: details || null });
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const data = await loadHabitsWithTags(req.userId!);
    res.json(data);
  } catch (error) {
    console.error('Error fetching habits:', error);
    res.status(500).json({ error: 'Failed to fetch habits' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, category, color, projectId, columnId } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const [newHabit] = await db.insert(habits).values({
      userId: req.userId!, title, category: category || 'Personal', color: color || 'primary',
      streak: 0, completedDays: '[]', projectId: projectId || null, columnId: columnId || null,
    } as InsertHabit).returning();

    await logActivity(req.userId!, 'habit', newHabit.id, 'created');
    res.status(201).json({ ...newHabit, completedDays: [], tags: [] });
  } catch (error) {
    console.error('Error creating habit:', error);
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitId = parseInt(req.params.id);
    const { completedDays, title, category, color, projectId, columnId } = req.body;

    const updates: any = {};
    if (completedDays !== undefined) { updates.completedDays = JSON.stringify(completedDays); updates.streak = calculateStreak(completedDays); }
    if (title !== undefined) updates.title = title;
    if (category !== undefined) updates.category = category;
    if (color !== undefined) updates.color = color;
    if (projectId !== undefined) updates.projectId = projectId;
    if (columnId !== undefined) updates.columnId = columnId;
    updates.updatedAt = new Date().toISOString();

    const [updated] = await db.update(habits).set(updates)
      .where(and(eq(habits.id, habitId), eq(habits.userId, req.userId!))).returning();

    if (!updated) return res.status(404).json({ error: 'Habit not found' });

    await logActivity(req.userId!, 'habit', habitId, 'updated');
    res.json({ ...updated, completedDays: JSON.parse(updated.completedDays || '[]'), streak: calculateStreak(JSON.parse(updated.completedDays || '[]')) });
  } catch (error) {
    console.error('Error updating habit:', error);
    res.status(500).json({ error: 'Failed to update habit' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitId = parseInt(req.params.id);
    const result = await db.delete(habits).where(and(eq(habits.id, habitId), eq(habits.userId, req.userId!))).returning();
    if (result.length === 0) return res.status(404).json({ error: 'Habit not found' });
    res.json({ message: 'Habit deleted successfully' });
  } catch (error) {
    console.error('Error deleting habit:', error);
    res.status(500).json({ error: 'Failed to delete habit' });
  }
});

// --- TAG ROUTES ---
router.post('/:id/tags', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitId = parseInt(req.params.id);
    const { name, color, tagId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tag name is required' });

    let useTagId = tagId;
    if (!useTagId) {
      const existing = await db.select().from(tags)
        .where(and(eq(tags.userId, req.userId!), eq(tags.name, name.trim().toLowerCase())));
      if (existing.length > 0) { useTagId = existing[0].id; }
      else {
        const [newTag] = await db.insert(tags).values({
          userId: req.userId!, name: name.trim(), color: color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)],
        }).returning();
        useTagId = newTag.id;
      }
    }

    const existingAssignment = await db.select().from(habitTagAssignments)
      .where(and(eq(habitTagAssignments.habitId, habitId), eq(habitTagAssignments.tagId, useTagId)));
    if (existingAssignment.length === 0) {
      await db.insert(habitTagAssignments).values({ habitId, tagId: useTagId });
    }

    const tag = await db.select().from(tags).where(eq(tags.id, useTagId));
    res.json({ tag: tag[0] });
  } catch (error) {
    console.error('Error adding tag to habit:', error);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

router.post('/:id/tags/:tagId/toggle', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const habitId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);

    const existing = await db.select().from(habitTagAssignments)
      .where(and(eq(habitTagAssignments.habitId, habitId), eq(habitTagAssignments.tagId, tagId)));

    if (existing.length > 0) {
      await db.delete(habitTagAssignments)
        .where(and(eq(habitTagAssignments.habitId, habitId), eq(habitTagAssignments.tagId, tagId)));
    } else {
      await db.insert(habitTagAssignments).values({ habitId, tagId });
    }

    const allAssignments = await db.select().from(habitTagAssignments).where(eq(habitTagAssignments.habitId, habitId));
    const tagIds = allAssignments.map(a => a.tagId);
    const assignedTags = tagIds.length > 0 ? await db.select().from(tags).where(sql`${tags.id} = ANY(${tagIds})`) : [];

    res.json({ tags: assignedTags });
  } catch (error) {
    console.error('Error toggling habit tag:', error);
    res.status(500).json({ error: 'Failed to toggle tag' });
  }
});

router.delete('/tags/:tagId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tagId = parseInt(req.params.tagId);
    await db.delete(habitTagAssignments).where(eq(habitTagAssignments.tagId, tagId));
    await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, req.userId!)));
    res.json({ message: 'Tag deleted' });
  } catch (error) {
    console.error('Error deleting habit tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// --- ACTIVITY ROUTE ---
router.get('/:id/activity', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const entityId = parseInt(req.params.id);
    const logs = await db.select().from(activityLogs)
      .where(and(eq(activityLogs.userId, req.userId!), eq(activityLogs.entityType, 'habit'), eq(activityLogs.entityId, entityId)))
      .orderBy(desc(activityLogs.createdAt));
    res.json(logs);
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

export default router;
