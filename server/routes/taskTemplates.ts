import { Router, Response } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { taskTemplates } from '../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { generateShareCode, normalizeShareCode } from '../lib/shareCode.js';
import { SERVER_PLAN_LIMITS } from '../lib/tier.js';
import { resolveEffectiveUserPlan } from '../lib/orgLifecycle.js';

const router = Router();

type TaskTemplateRow = typeof taskTemplates.$inferSelect;

const parseRow = (t: TaskTemplateRow) => ({
  ...t,
  labels: JSON.parse(t.labels || '[]'),
  subtasks: JSON.parse(t.subtasks || '[]'),
  checklists: JSON.parse(t.checklists || '[]'),
  images: JSON.parse(t.images || '[]'),
  attachments: JSON.parse(t.attachments || '[]'),
});

async function allocateShareCode(): Promise<string | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateShareCode('TASK');
    const clash = await db.select({ id: taskTemplates.id }).from(taskTemplates).where(eq(taskTemplates.shareCode, candidate)).limit(1);
    if (!clash.length) return candidate;
  }
  return null;
}

// Redeem a public share code: returns the template to copy into a task.
// Task codes never resolve note templates and vice versa (type scoping).
router.get('/code/:code', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = normalizeShareCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Enter a share code' });
    const result = await db.select().from(taskTemplates).where(and(eq(taskTemplates.shareCode, code), eq(taskTemplates.isPublic, true))).limit(1);
    if (!result.length) return res.status(404).json({ error: 'No task template found for that code' });
    res.json(parseRow(result[0]));
  } catch (error) {
    console.error('Failed to fetch template by code:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.select().from(taskTemplates).where(eq(taskTemplates.userId, req.userId!)).orderBy(taskTemplates.name);
    res.json({ templates: result.map(parseRow) });
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, title, description, priority, duration, startDate, startTime, dueDate, dueTime, projectId, columnId, labels, subtasks, checklists, images, attachments, isPublic } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });

    const effectivePlan = await resolveEffectiveUserPlan(req.userId!);
    const tier = effectivePlan.tier;
    const maxTemplates = SERVER_PLAN_LIMITS.taskTemplates[tier];
    if (Number.isFinite(maxTemplates)) {
      const existingCount = await db.select({ count: sql<number>`count(*)` }).from(taskTemplates).where(eq(taskTemplates.userId, req.userId!));
      if (Number(existingCount[0]?.count || 0) >= maxTemplates) {
        return res.status(403).json({ error: `Template limit reached (${maxTemplates} max on your plan). Upgrade to add more.` });
      }
    }

    const wantsPublic = isPublic === true;
    let shareCode: string | null = null;
    if (wantsPublic) {
      shareCode = await allocateShareCode();
      if (!shareCode) return res.status(500).json({ error: 'Could not allocate a share code — please try again' });
    }
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
      isPublic: wantsPublic,
      shareCode,
    }).returning();
    res.json(parseRow(template));
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
    const { name, title, description, priority, duration, startDate, startTime, dueDate, dueTime, projectId, columnId, labels, subtasks, checklists, images, attachments, isPublic } = req.body;
    let shareCodeUpdate: string | null | undefined;
    if (isPublic !== undefined) {
      if (isPublic === true) {
        if (!existing[0].shareCode) {
          const code = await allocateShareCode();
          if (!code) return res.status(500).json({ error: 'Could not allocate a share code — please try again' });
          shareCodeUpdate = code;
        }
      } else {
        shareCodeUpdate = null;
      }
    }
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
      isPublic: isPublic !== undefined ? isPublic === true : undefined,
      shareCode: shareCodeUpdate,
      updatedAt: new Date().toISOString(),
    }).where(eq(taskTemplates.id, id)).returning();
    res.json(parseRow(updated));
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
