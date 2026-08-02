import { Router, Response } from 'express';
import { db } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { tags } from '../../shared/schema';
import { and, eq, sql } from 'drizzle-orm';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db
      .select()
      .from(tags)
      .where(eq(tags.userId, req.userId!))
      .orderBy(tags.name);
    res.json({ tags: result });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Tag name is required' });
      return;
    }

    const normalized = name.trim();
    const existing = await db
      .select()
      .from(tags)
      .where(and(eq(tags.userId, req.userId!), sql`lower(${tags.name}) = lower(${normalized})`));

    if (existing.length > 0) {
      res.json(existing[0]);
      return;
    }

    const [tag] = await db
      .insert(tags)
      .values({ userId: req.userId!, name: normalized, color: color || '#3b82f6' })
      .returning();
    res.json(tag);
  } catch (error) {
    console.error('Create tag error:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tagId = parseInt(req.params.id, 10);
    if (isNaN(tagId)) { res.status(400).json({ error: 'Invalid tag ID' }); return; }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Tag name is required' });
      return;
    }

    const normalized = name.trim();
    const [tag] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, req.userId!)));
    if (!tag) { res.status(404).json({ error: 'Tag not found' }); return; }

    const existing = await db
      .select()
      .from(tags)
      .where(and(
        eq(tags.userId, req.userId!),
        sql`lower(${tags.name}) = lower(${normalized})`,
        sql`${tags.id} != ${tagId}`
      ));
    if (existing.length > 0) {
      res.status(409).json({ error: 'Tag name already exists' });
      return;
    }

    const [updated] = await db
      .update(tags)
      .set({ name: normalized })
      .where(eq(tags.id, tagId))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error('Rename tag error:', error);
    res.status(500).json({ error: 'Failed to rename tag' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tagId = parseInt(req.params.id, 10);
    if (isNaN(tagId)) { res.status(400).json({ error: 'Invalid tag ID' }); return; }

    const [tag] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, req.userId!)));
    if (!tag) { res.status(404).json({ error: 'Tag not found' }); return; }

    await db.delete(tags).where(eq(tags.id, tagId));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

export default router;
