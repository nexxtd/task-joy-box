import { Router, Response } from 'express';
import { db } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { noteTemplates } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.select().from(noteTemplates).where(eq(noteTemplates.userId, req.userId!)).orderBy(noteTemplates.name);
    const parsed = result.map(t => ({
      ...t,
      tags: JSON.parse(t.tags || '[]'),
    }));
    res.json({ templates: parsed });
  } catch (error) {
    console.error('Failed to fetch note templates:', error);
    res.status(500).json({ error: 'Failed to fetch note templates' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, title, content, color, projectId, tags } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });
    const [template] = await db.insert(noteTemplates).values({
      userId: req.userId!,
      name: name.trim(),
      title: title || '',
      content: content || '',
      color: color || 'hsl(var(--card))',
      projectId: projectId || null,
      tags: JSON.stringify(tags || []),
    }).returning();
    res.json({ ...template, tags: JSON.parse(template.tags || '[]') });
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
    const { name, title, content, color, projectId, tags } = req.body;
    const [updated] = await db.update(noteTemplates).set({
      name: name !== undefined ? name.trim() : undefined,
      title: title !== undefined ? title : undefined,
      content: content !== undefined ? content : undefined,
      color: color !== undefined ? color : undefined,
      projectId: projectId !== undefined ? projectId : null,
      tags: tags !== undefined ? JSON.stringify(tags) : undefined,
      updatedAt: new Date().toISOString(),
    }).where(eq(noteTemplates.id, id)).returning();
    res.json({ ...updated, tags: JSON.parse(updated.tags || '[]') });
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
