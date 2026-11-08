import { Router, Response } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { noteTemplates } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { generateShareCode, normalizeShareCode } from '../lib/shareCode.js';

const router = Router();

const parseRow = (t: any) => ({
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
});

async function allocateShareCode(): Promise<string | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateShareCode('NOTE');
    const clash = await db.select({ id: noteTemplates.id }).from(noteTemplates).where(eq(noteTemplates.shareCode, candidate)).limit(1);
    if (!clash.length) return candidate;
  }
  return null;
}

// Redeem a public share code: returns the template to copy into a note.
// Note codes never resolve task templates and vice versa (type scoping).
router.get('/code/:code', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = normalizeShareCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Enter a share code' });
    const result = await db.select().from(noteTemplates).where(and(eq(noteTemplates.shareCode, code), eq(noteTemplates.isPublic, true))).limit(1);
    if (!result.length) return res.status(404).json({ error: 'No note template found for that code' });
    res.json(parseRow(result[0]));
  } catch (error) {
    console.error('Failed to fetch template by code:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.select().from(noteTemplates).where(eq(noteTemplates.userId, req.userId!)).orderBy(noteTemplates.name);
    res.json({ templates: result.map(parseRow) });
  } catch (error) {
    console.error('Failed to fetch note templates:', error);
    res.status(500).json({ error: 'Failed to fetch note templates' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, title, content, description, color, priority, duration, startDate, startTime, dueDate, dueTime, projectId, columnId, tags, labels, subtasks, checklists, images, attachments, isPublic } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });
    const wantsPublic = isPublic === true;
    let shareCode: string | null = null;
    if (wantsPublic) {
      shareCode = await allocateShareCode();
      if (!shareCode) return res.status(500).json({ error: 'Could not allocate a share code — please try again' });
    }
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
      isPublic: wantsPublic,
      shareCode,
    } as any).returning();
    res.json(parseRow(template));
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
    res.json(parseRow(updated));
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
