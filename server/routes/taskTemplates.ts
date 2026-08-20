import { Router, Response } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { taskTemplates } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.select().from(taskTemplates).where(eq(taskTemplates.userId, req.userId!)).orderBy(taskTemplates.name);
    const parsed = result.map(t => ({
      ...t,
      labels: JSON.parse(t.labels || '[]'),
      subtasks: JSON.parse(t.subtasks || '[]'),
      checklists: JSON.parse(t.checklists || '[]'),
      images: JSON.parse(t.images || '[]'),
      attachments: JSON.parse(t.attachments || '[]'),
    }));
    res.json({ templates: parsed });
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, title, description, priority, duration, startDate, startTime, dueDate, dueTime, projectId, columnId, labels, subtasks, checklists, images, attachments } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });
    const [template] = await db.insert(taskTemplates).values({
      userId: req.userId!,
      name: name.trim(),
      title: title || '',
      description: description || '',
      priority: priority || 'medium',
      duration: duration || null,
      startDate: startDate || null,
      startTime: startTime || null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      projectId: projectId || null,
      columnId: columnId || null,
      labels: JSON.stringify(labels || []),
      subtasks: JSON.stringify(subtasks || []),
      checklists: JSON.stringify(checklists || []),
      images: JSON.stringify(images || []),
      attachments: JSON.stringify(attachments || []),
    }).returning();
    res.json({ ...template, labels: JSON.parse(template.labels || '[]'), subtasks: JSON.parse(template.subtasks || '[]'), checklists: JSON.parse(template.checklists || '[]'), images: JSON.parse(template.images || '[]'), attachments: JSON.parse(template.attachments || '[]') });
  } catch (error) {
    console.error('Failed to create template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await db.select().from(taskTemplates).where(eq(taskTemplates.id, id)).limit(1);
    if (!existing.length || existing[0].userId !== req.userId) return res.status(404).json({ error: 'Template not found' });
    const { name, title, description, priority, duration, startDate, startTime, dueDate, dueTime, projectId, columnId, labels, subtasks, checklists, images, attachments } = req.body;
    const [updated] = await db.update(taskTemplates).set({
      name: name !== undefined ? name.trim() : undefined,
      title: title !== undefined ? title : undefined,
      description: description !== undefined ? description : undefined,
      priority: priority !== undefined ? priority : undefined,
      duration: duration !== undefined ? duration : null,
      startDate: startDate !== undefined ? startDate : null,
      startTime: startTime !== undefined ? startTime : null,
      dueDate: dueDate !== undefined ? dueDate : null,
      dueTime: dueTime !== undefined ? dueTime : null,
      projectId: projectId !== undefined ? projectId : null,
      columnId: columnId !== undefined ? columnId : null,
      labels: labels !== undefined ? JSON.stringify(labels) : undefined,
      subtasks: subtasks !== undefined ? JSON.stringify(subtasks) : undefined,
      checklists: checklists !== undefined ? JSON.stringify(checklists) : undefined,
      images: images !== undefined ? JSON.stringify(images) : undefined,
      attachments: attachments !== undefined ? JSON.stringify(attachments) : undefined,
      updatedAt: new Date().toISOString(),
    }).where(eq(taskTemplates.id, id)).returning();
    res.json({ ...updated, labels: JSON.parse(updated.labels || '[]'), subtasks: JSON.parse(updated.subtasks || '[]'), checklists: JSON.parse(updated.checklists || '[]'), images: JSON.parse(updated.images || '[]'), attachments: JSON.parse(updated.attachments || '[]') });
  } catch (error) {
    console.error('Failed to update template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await db.select().from(taskTemplates).where(eq(taskTemplates.id, id)).limit(1);
    if (!existing.length || existing[0].userId !== req.userId) return res.status(404).json({ error: 'Template not found' });
    await db.delete(taskTemplates).where(eq(taskTemplates.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
