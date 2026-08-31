import { Router, Response } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { noteTemplates } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.select().from(noteTemplates).where(eq(noteTemplates.userId, req.userId!)).orderBy(noteTemplates.name);
    const parsed = result.map(t => ({
      ...t,
      tags: JSON.parse((t as any).tags || '[]'),
      labels: JSON.parse((t as any).labels || '[]'),
      subtasks: JSON.parse((t as any).subtasks || '[]'),
      checklists: JSON.parse((t as any).checklists || '[]'),
      images: JSON.parse((t as any).images || '[]'),
      attachments: JSON.parse((t as any).attachments || '[]'),
      description: (t as any).description || (t as any).content || '',
      content: (t as any).content || (t as any).description || '',
      columnId: (t as any).columnId || null,
    }));
    res.json({ templates: parsed });
  } catch (error) {
    console.error('Failed to fetch note templates:', error);
    res.status(500).json({ error: 'Failed to fetch note templates' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, title, content, description, color, priority, duration, startDate, startTime, dueDate, dueTime, projectId, columnId, tags, labels, subtasks, checklists, images, attachments } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });
    const effectiveContent = content || description || '';
    const effectiveDescription = description || content || '';
    const effectiveTags = tags || labels || [];
    const effectiveLabels = labels || tags || [];
    const [template] = await db.insert(noteTemplates).values({
      userId: req.userId!,
      name: name.trim(),
      title: title || '',
      content: effectiveContent,
      description: effectiveDescription,
      color: color || 'hsl(var(--card))',
      priority: priority || 'medium',
      duration: duration || null,
      startDate: startDate || null,
      startTime: startTime || null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      projectId: projectId || null,
      columnId: columnId || null,
      tags: JSON.stringify(effectiveTags),
      labels: JSON.stringify(effectiveLabels),
      subtasks: JSON.stringify(subtasks || []),
      checklists: JSON.stringify(checklists || []),
      images: JSON.stringify(images || []),
      attachments: JSON.stringify(attachments || []),
    } as any).returning();
    res.json({ ...template, tags: JSON.parse((template as any).tags || '[]'), labels: JSON.parse((template as any).labels || '[]'), subtasks: JSON.parse((template as any).subtasks || '[]'), checklists: JSON.parse((template as any).checklists || '[]'), images: JSON.parse((template as any).images || '[]'), attachments: JSON.parse((template as any).attachments || '[]'), description: (template as any).description || (template as any).content || '', content: (template as any).content || (template as any).description || '', columnId: (template as any).columnId || null });
  } catch (error) {
    console.error('Failed to create note template:', error);
    res.status(500).json({ error: 'Failed to create note template' });
  }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await db.select().from(noteTemplates).where(eq(noteTemplates.id, id)).limit(1);
    if (!existing.length || existing[0].userId !== req.userId) return res.status(404).json({ error: 'Template not found' });
    const { name, title, content, description, color, priority, duration, startDate, startTime, dueDate, dueTime, projectId, columnId, tags, labels, subtasks, checklists, images, attachments } = req.body;
    const [updated] = await db.update(noteTemplates).set({
      name: name !== undefined ? name.trim() : undefined,
      title: title !== undefined ? title : undefined,
      content: content !== undefined ? content : description !== undefined ? description : undefined,
      description: description !== undefined ? description : content !== undefined ? content : undefined,
      color: color !== undefined ? color : undefined,
      priority: priority !== undefined ? priority : undefined,
      duration: duration !== undefined ? duration : undefined,
      startDate: startDate !== undefined ? startDate : undefined,
      startTime: startTime !== undefined ? startTime : undefined,
      dueDate: dueDate !== undefined ? dueDate : undefined,
      dueTime: dueTime !== undefined ? dueTime : undefined,
      projectId: projectId !== undefined ? projectId : undefined,
      columnId: columnId !== undefined ? columnId : undefined,
      tags: tags !== undefined ? JSON.stringify(tags) : labels !== undefined ? JSON.stringify(labels) : undefined,
      labels: labels !== undefined ? JSON.stringify(labels) : tags !== undefined ? JSON.stringify(tags) : undefined,
      subtasks: subtasks !== undefined ? JSON.stringify(subtasks) : undefined,
      checklists: checklists !== undefined ? JSON.stringify(checklists) : undefined,
      images: images !== undefined ? JSON.stringify(images) : undefined,
      attachments: attachments !== undefined ? JSON.stringify(attachments) : undefined,
      updatedAt: new Date().toISOString(),
    } as any).where(eq(noteTemplates.id, id)).returning();
    res.json({ ...updated, tags: JSON.parse((updated as any).tags || '[]'), labels: JSON.parse((updated as any).labels || '[]'), subtasks: JSON.parse((updated as any).subtasks || '[]'), checklists: JSON.parse((updated as any).checklists || '[]'), images: JSON.parse((updated as any).images || '[]'), attachments: JSON.parse((updated as any).attachments || '[]'), description: (updated as any).description || (updated as any).content || '', content: (updated as any).content || (updated as any).description || '', columnId: (updated as any).columnId || null });
  } catch (error) {
    console.error('Failed to update note template:', error);
    res.status(500).json({ error: 'Failed to update note template' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await db.select().from(noteTemplates).where(eq(noteTemplates.id, id)).limit(1);
    if (!existing.length || existing[0].userId !== req.userId) return res.status(404).json({ error: 'Template not found' });
    await db.delete(noteTemplates).where(eq(noteTemplates.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete note template:', error);
    res.status(500).json({ error: 'Failed to delete note template' });
  }
});

export default router;
