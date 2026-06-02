import express from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { projectColumns, projectMembers } from '../../shared/schema';

const router = express.Router();

// Get all columns for a specific project
router.get('/:projectId', async (req: any, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is a member of the project
    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, req.userId)
      ));

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }

    const columns = await db
      .select()
      .from(projectColumns)
      .where(eq(projectColumns.projectId, projectId))
      .orderBy(projectColumns.orderNum);

    res.json({ columns });
  } catch (error) {
    console.error('Get project columns error:', error);
    res.status(500).json({ error: 'Failed to get project columns' });
  }
});

// Create a new column for a specific project
router.post('/:projectId', async (req: any, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const { title, order, color } = req.body;

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is a member of the project
    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, req.userId)
      ));

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }

    const [column] = await db
      .insert(projectColumns)
      .values({
        projectId,
        title,
        orderNum: order || 0,
        color: color || '#9CA3AF',
      })
      .returning();

    res.json({ column });
  } catch (error) {
    console.error('Create project column error:', error);
    res.status(500).json({ error: 'Failed to create project column' });
  }
});

// Update a project column
router.patch('/:projectId/:columnId', async (req: any, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const columnId = parseInt(req.params.columnId, 10);
    const updates = req.body;

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is a member of the project
    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, req.userId)
      ));

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }

    await db
      .update(projectColumns)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(and(
        eq(projectColumns.id, columnId),
        eq(projectColumns.projectId, projectId)
      ));

    const [updatedColumn] = await db
      .select()
      .from(projectColumns)
      .where(and(
        eq(projectColumns.id, columnId),
        eq(projectColumns.projectId, projectId)
      ));

    res.json({ column: updatedColumn });
  } catch (error) {
    console.error('Update project column error:', error);
    res.status(500).json({ error: 'Failed to update project column' });
  }
});

// Delete a project column
router.delete('/:projectId/:columnId', async (req: any, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const columnId = parseInt(req.params.columnId, 10);

    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is a member of the project
    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, req.userId)
      ));

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }

    await db
      .delete(projectColumns)
      .where(and(
        eq(projectColumns.id, columnId),
        eq(projectColumns.projectId, projectId)
      ));

    res.json({ message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Delete project column error:', error);
    res.status(500).json({ error: 'Failed to delete project column' });
  }
});

export default router;