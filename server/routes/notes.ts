import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { notes } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { encrypt, decrypt, encryptField } from '../lib/encryption';

const router = Router();

// Get all notes for the current user
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userNotes = await db.select()
      .from(notes)
      .where(eq(notes.userId, req.userId!))
      .orderBy(desc(notes.createdAt));

    // Decrypt sensitive fields before sending
    const decrypted = userNotes.map(note => ({
      ...note,
      title: decrypt(note.title) ?? note.title,
      content: decrypt(note.content) ?? note.content,
    }));

    res.json(decrypted);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// Create a new note
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, color } = req.body;

    const [newNote] = await db.insert(notes).values({
      userId: req.userId!,
      title: encrypt(title || '') ?? '',
      content: encrypt(content || '') ?? '',
      color: color || 'hsl(var(--card))',
    }).returning();

    res.status(201).json({
      ...newNote,
      title: decrypt(newNote.title) ?? newNote.title,
      content: decrypt(newNote.content) ?? newNote.content,
    });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// Update a note
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const noteId = parseInt(req.params.id);
    const updates = { ...req.body };

    if (updates.title !== undefined) updates.title = encrypt(updates.title) ?? updates.title;
    if (updates.content !== undefined) updates.content = encrypt(updates.content) ?? updates.content;

    const [updatedNote] = await db.update(notes)
      .set({
        ...updates,
        updatedAt: new Date().toISOString()
      })
      .where(and(eq(notes.id, noteId), eq(notes.userId, req.userId!)))
      .returning();

    if (!updatedNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json({
      ...updatedNote,
      title: decrypt(updatedNote.title) ?? updatedNote.title,
      content: decrypt(updatedNote.content) ?? updatedNote.content,
    });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete a note
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

export default router;
