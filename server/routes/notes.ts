import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { notes, tags, noteTagAssignments, activityLogs } from '../../shared/schema';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { encrypt, decrypt } from '../lib/encryption';

const router = Router();

const NOTE_TAG_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ');

async function logActivity(userId: number, entityType: string, entityId: number, action: string, details?: string) {
  await db.insert(activityLogs).values({ userId, entityType, entityId, action, details: details || null });
}

async function loadNotesPayload(userId: number) {
  const [userNotes, userTags, assignments] = await Promise.all([
    db.select().from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.pinned), desc(notes.updatedAt), desc(notes.createdAt)),
    db.select().from(tags).where(eq(tags.userId, userId)).orderBy(asc(tags.name)),
    db.select({
      noteId: noteTagAssignments.noteId,
      tagId: noteTagAssignments.tagId,
    }).from(noteTagAssignments),
  ]);

  const tagsById = new Map(userTags.map(tag => [tag.id, tag]));
  const noteTagMap = new Map<number, Array<{ id: number; name: string; color: string }>>();

  assignments.forEach(row => {
    const tag = tagsById.get(row.tagId);
    if (!tag) return;
    const list = noteTagMap.get(row.noteId) || [];
    list.push({ id: tag.id, name: tag.name, color: tag.color });
    noteTagMap.set(row.noteId, list);
  });

  return {
    notes: userNotes.map(note => ({
      ...note,
      title: decrypt(note.title) ?? note.title,
      content: decrypt(note.content) ?? note.content,
      tags: noteTagMap.get(note.id) || [],
    })),
    tags: userTags.map(tag => ({
      ...tag,
    })),
  };
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const payload = await loadNotesPayload(req.userId!);
    res.json(payload);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, color, pinned, checklists, subtasks, status, projectId, columnId } = req.body;
    const [newNote] = await db.insert(notes).values({
      userId: req.userId!,
      title: encrypt(title || '') ?? '',
      content: encrypt(content || '') ?? '',
      color: color || 'hsl(var(--card))',
      pinned: Boolean(pinned),
      checklists: checklists || '[]',
      subtasks: subtasks || '[]',
      status: status || 'to_do',
      projectId: projectId || null,
      columnId: columnId || null,
    }).returning();

    await logActivity(req.userId!, 'note', newNote.id, 'created');

    const payload = await loadNotesPayload(req.userId!);
    const created = payload.notes.find(note => note.id === newNote.id);
    res.status(201).json(created || {
      ...newNote,
      title: decrypt(newNote.title) ?? newNote.title,
      content: decrypt(newNote.content) ?? newNote.content,
      tags: [],
    });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const noteId = parseInt(req.params.id);
    const allowedFields = ['title', 'content', 'color', 'pinned', 'checklists', 'subtasks', 'status', 'projectId', 'columnId'];
    const updates: Record<string, any> = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    if (updates.title !== undefined) updates.title = encrypt(updates.title) ?? updates.title;
    if (updates.content !== undefined) updates.content = encrypt(updates.content) ?? updates.content;
    updates.updatedAt = new Date().toISOString();

    const [updatedNote] = await db.update(notes)
      .set(updates)
      .where(and(eq(notes.id, noteId), eq(notes.userId, req.userId!)))
      .returning();

    if (!updatedNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    await logActivity(req.userId!, 'note', noteId, 'updated');

    const payload = await loadNotesPayload(req.userId!);
    const hydrated = payload.notes.find(note => note.id === updatedNote.id) || {
      ...updatedNote,
      title: decrypt(updatedNote.title) ?? updatedNote.title,
      content: decrypt(updatedNote.content) ?? updatedNote.content,
      tags: [],
    };
    res.json(hydrated);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const noteId = parseInt(req.params.id);
    const result = await db.delete(notes)
      .where(and(eq(notes.id, noteId), eq(notes.userId, req.userId!)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

router.post('/:id/tags', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const noteId = parseInt(req.params.id);
    const { name, color, tagId } = req.body as { name?: string; color?: string; tagId?: number };

    const note = await db.select().from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, req.userId!))).limit(1);
    if (note.length === 0) return res.status(404).json({ error: 'Note not found' });

    let tag = null as null | { id: number; name: string; color: string };

    if (tagId) {
      const existing = await db.select().from(tags).where(and(eq(tags.id, tagId), eq(tags.userId, req.userId!))).limit(1);
      if (existing.length === 0) return res.status(404).json({ error: 'Tag not found' });
      tag = existing[0];
    } else {
      const normalized = normalizeName(name || '');
      if (!normalized) return res.status(400).json({ error: 'Tag name is required' });
      const existingAll = await db.select().from(tags).where(eq(tags.userId, req.userId!));
      const existing = existingAll.find(item => item.name.trim().toLowerCase() === normalized.toLowerCase());
      if (existing) {
        tag = existing;
      } else {
        const [created] = await db.insert(tags).values({
          userId: req.userId!,
          name: normalized,
          color: color || NOTE_TAG_COLORS[Math.floor(Math.random() * NOTE_TAG_COLORS.length)],
        }).returning();
        tag = created;
      }
    }

    if (!tag) return res.status(400).json({ error: 'Tag unavailable' });

    const existingAssignment = await db.select()
      .from(noteTagAssignments)
      .where(and(eq(noteTagAssignments.noteId, noteId), eq(noteTagAssignments.tagId, tag.id)))
      .limit(1);

    if (existingAssignment.length === 0) {
      await db.insert(noteTagAssignments).values({
        noteId,
        tagId: tag.id,
      });
    }

    const payload = await loadNotesPayload(req.userId!);
    const hydrated = payload.notes.find(item => item.id === noteId);
    res.json({ note: hydrated, tag });
  } catch (error) {
    console.error('Error adding note tag:', error);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

router.post('/:id/tags/:tagId/toggle', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const noteId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);

    const note = await db.select().from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, req.userId!))).limit(1);
    if (note.length === 0) return res.status(404).json({ error: 'Note not found' });

    const tag = await db.select().from(tags).where(and(eq(tags.id, tagId), eq(tags.userId, req.userId!))).limit(1);
    if (tag.length === 0) return res.status(404).json({ error: 'Tag not found' });

    const existingAssignment = await db.select()
      .from(noteTagAssignments)
      .where(and(eq(noteTagAssignments.noteId, noteId), eq(noteTagAssignments.tagId, tagId)))
      .limit(1);

    if (existingAssignment.length > 0) {
      await db.delete(noteTagAssignments).where(and(eq(noteTagAssignments.noteId, noteId), eq(noteTagAssignments.tagId, tagId)));
    } else {
      await db.insert(noteTagAssignments).values({ noteId, tagId });
    }

    const payload = await loadNotesPayload(req.userId!);
    const hydrated = payload.notes.find(item => item.id === noteId);
    res.json({ note: hydrated, tag: tag[0] });
  } catch (error) {
    console.error('Error toggling note tag:', error);
    res.status(500).json({ error: 'Failed to toggle tag' });
  }
});

router.delete('/tags/:tagId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tagId = parseInt(req.params.tagId);
    const result = await db.delete(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, req.userId!)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting note tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// --- ACTIVITY ROUTE ---
router.get('/:id/activity', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const entityId = parseInt(req.params.id);
    const logs = await db.select().from(activityLogs)
      .where(and(eq(activityLogs.userId, req.userId!), eq(activityLogs.entityType, 'note'), eq(activityLogs.entityId, entityId)))
      .orderBy(desc(activityLogs.createdAt));
    res.json(logs);
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

export default router;
