import { Router, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { milestones, projectMembers, projects } from '../../shared/schema';

const router = Router();

router.get('/:projectId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const membership = await db.select().from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (membership.length === 0) return res.status(403).json({ error: 'Not a member' });

    const rows = await db.select().from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(milestones.date);
    res.json({ milestones: rows });
  } catch (error) {
    console.error('Get milestones error:', error);
    res.status(500).json({ error: 'Failed to fetch milestones' });
  }
});

router.post('/:projectId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const membership = await db.select().from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (membership.length === 0) return res.status(403).json({ error: 'Not a member' });

    const { name, date, description } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'Name and date required' });

    const [milestone] = await db.insert(milestones).values({
      projectId, name, date, description: description || null,
    }).returning();

    res.json({ milestone });
  } catch (error) {
    console.error('Create milestone error:', error);
    res.status(500).json({ error: 'Failed to create milestone' });
  }
});

router.patch('/:projectId/:milestoneId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const milestoneId = parseInt(req.params.milestoneId, 10);
    const membership = await db.select().from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (membership.length === 0) return res.status(403).json({ error: 'Not a member' });

    const { name, date, description, completed } = req.body;
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (date !== undefined) updates.date = date;
    if (description !== undefined) updates.description = description;
    if (completed !== undefined) updates.completed = completed;

    const [milestone] = await db.update(milestones)
      .set(updates)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
      .returning();

    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
    res.json({ milestone });
  } catch (error) {
    console.error('Update milestone error:', error);
    res.status(500).json({ error: 'Failed to update milestone' });
  }
});

router.delete('/:projectId/:milestoneId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const milestoneId = parseInt(req.params.milestoneId, 10);
    const membership = await db.select().from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (membership.length === 0) return res.status(403).json({ error: 'Not a member' });

    await db.delete(milestones)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete milestone error:', error);
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
});

export default router;
