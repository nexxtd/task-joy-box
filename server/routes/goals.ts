import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { goals, tags, goalTagAssignments, activityLogs, users, type InsertGoal } from '../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { encrypt, decrypt } from '../lib/encryption';
import { getSettingNumber } from '../lib/settings';

const router = Router();

const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

async function loadGoalsWithTags(userId: number) {
  const userGoals = await db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.updatedAt));
  const allTags = await db.select().from(tags).where(eq(tags.userId, userId));
  const allAssignments = await db.select().from(goalTagAssignments);

  const tagsByGoal = new Map<number, typeof allTags>();
  for (const a of allAssignments) {
    if (!tagsByGoal.has(a.goalId)) tagsByGoal.set(a.goalId, []);
    const tag = allTags.find(t => t.id === a.tagId);
    if (tag) tagsByGoal.get(a.goalId)!.push(tag);
  }

  return {
    goals: userGoals.map(g => ({
      ...g,
      title: decrypt(g.title) ?? g.title,
      description: decrypt(g.description) ?? g.description,
      tags: tagsByGoal.get(g.id) || [],
    })),
    tags: allTags,
  };
}

async function logActivity(userId: number, entityType: string, entityId: number, action: string, details?: string) {
  await db.insert(activityLogs).values({ userId, entityType, entityId, action, details: details || null });
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const data = await loadGoalsWithTags(req.userId!);
    res.json(data);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const freeLimit = await getSettingNumber('free_tier_goal_limit', 5);
    if (freeLimit > 0) {
      const [user] = await db.select({ subscriptionTier: users.subscriptionTier }).from(users).where(eq(users.id, req.userId!)).limit(1);
      if ((user?.subscriptionTier || 'free') === 'free') {
        const counts = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(goals)
          .where(eq(goals.userId, req.userId!));
        if (counts[0]?.count !== undefined && Number(counts[0].count) >= freeLimit) {
          return res.status(403).json({
            error: 'LIMIT_REACHED',
            message: `Free plan allows up to ${freeLimit} goals. Upgrade to add more.`,
            limit: freeLimit,
          });
        }
      }
    }
    const { title, description, target, unit, color, timeframe, subGoals, checklists, subtasks, status, projectId, columnId } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const [newGoal] = await db.insert(goals).values({
      userId: req.userId!, title: encrypt(title) ?? title, description: encrypt(description || '') ?? '',
      target: target || 100, unit: unit || 'units', color: color || 'hsl(var(--primary))',
      progress: 0, timeframe: timeframe || '1month', subGoals: subGoals || '[]',
      checklists: checklists || '[]', subtasks: subtasks || '[]', status: status || 'to_do',
      projectId: projectId || null, columnId: columnId || null,
    } as InsertGoal).returning();

    await logActivity(req.userId!, 'goal', newGoal.id, 'created');
    res.status(201).json({
      ...newGoal, title: decrypt(newGoal.title) ?? newGoal.title,
      description: decrypt(newGoal.description) ?? newGoal.description, tags: [],
    });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const goalId = parseInt(req.params.id);
    const allowedFields = ['title', 'description', 'target', 'unit', 'color', 'progress', 'timeframe', 'subGoals', 'checklists', 'subtasks', 'status', 'projectId', 'columnId', 'pinned'];
    const updates: Record<string, any> = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    if (updates.title !== undefined) updates.title = encrypt(updates.title) ?? updates.title;
    if (updates.description !== undefined) updates.description = encrypt(updates.description) ?? updates.description;
    updates.updatedAt = new Date().toISOString();

    const [updated] = await db.update(goals).set(updates)
      .where(and(eq(goals.id, goalId), eq(goals.userId, req.userId!))).returning();

    if (!updated) return res.status(404).json({ error: 'Goal not found' });

    await logActivity(req.userId!, 'goal', goalId, 'updated');
    res.json({
      ...updated, title: decrypt(updated.title) ?? updated.title,
      description: decrypt(updated.description) ?? updated.description,
    });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const goalId = parseInt(req.params.id);
    const result = await db.delete(goals).where(and(eq(goals.id, goalId), eq(goals.userId, req.userId!))).returning();
    if (result.length === 0) return res.status(404).json({ error: 'Goal not found' });
    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// --- TAG ROUTES ---
router.post('/:id/tags', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const goalId = parseInt(req.params.id);
    const goalExists = await db.select({ id: goals.id }).from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, req.userId!))).limit(1);
    if (goalExists.length === 0) return res.status(404).json({ error: 'Goal not found' });

    const { name, color, tagId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tag name is required' });

    let useTagId = tagId;
    if (useTagId) {
      const tagOwned = await db.select({ id: tags.id }).from(tags)
        .where(and(eq(tags.id, useTagId), eq(tags.userId, req.userId!))).limit(1);
      if (tagOwned.length === 0) return res.status(404).json({ error: 'Tag not found' });
    }
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

    const existingAssignment = await db.select().from(goalTagAssignments)
      .where(and(eq(goalTagAssignments.goalId, goalId), eq(goalTagAssignments.tagId, useTagId)));
    if (existingAssignment.length === 0) {
      await db.insert(goalTagAssignments).values({ goalId, tagId: useTagId });
    }

    const tag = await db.select().from(tags).where(eq(tags.id, useTagId));
    res.json({ tag: tag[0] });
  } catch (error) {
    console.error('Error adding tag to goal:', error);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

router.post('/:id/tags/:tagId/toggle', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const goalId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);

    const existing = await db.select().from(goalTagAssignments)
      .where(and(eq(goalTagAssignments.goalId, goalId), eq(goalTagAssignments.tagId, tagId)));

    if (existing.length > 0) {
      await db.delete(goalTagAssignments)
        .where(and(eq(goalTagAssignments.goalId, goalId), eq(goalTagAssignments.tagId, tagId)));
    } else {
      await db.insert(goalTagAssignments).values({ goalId, tagId });
    }

    const allAssignments = await db.select().from(goalTagAssignments).where(eq(goalTagAssignments.goalId, goalId));
    const tagIds = allAssignments.map(a => a.tagId);
    const assignedTags = tagIds.length > 0 ? await db.select().from(tags).where(sql`${tags.id} = ANY(${tagIds})`) : [];

    res.json({ tags: assignedTags });
  } catch (error) {
    console.error('Error toggling goal tag:', error);
    res.status(500).json({ error: 'Failed to toggle tag' });
  }
});

router.delete('/tags/:tagId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tagId = parseInt(req.params.tagId);
    await db.delete(goalTagAssignments).where(eq(goalTagAssignments.tagId, tagId));
    await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, req.userId!)));
    res.json({ message: 'Tag deleted' });
  } catch (error) {
    console.error('Error deleting goal tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// --- ACTIVITY ROUTE ---
router.get('/:id/activity', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const entityId = parseInt(req.params.id);
    const logs = await db.select().from(activityLogs)
      .where(and(eq(activityLogs.userId, req.userId!), eq(activityLogs.entityType, 'goal'), eq(activityLogs.entityId, entityId)))
      .orderBy(desc(activityLogs.createdAt));
    res.json(logs);
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

export default router;
