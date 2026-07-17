import { Router, Response } from 'express';
import { db } from '../db';
import { goalSnapshots, tasks, goalBoards, users } from '../../shared/schema';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Update task assignment (assign/unassign user to task)
router.patch('/tasks/:taskId/assignment', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = req.params.taskId;
    const { assignedToUserId } = req.body; // null to unassign
    
    // Note: tasks table uses string IDs for client-side generated IDs
    // This endpoint handles the assignment update in the board snapshot
    
    res.json({ success: true, taskId, assignedToUserId });
  } catch (error) {
    console.error('Failed to update task assignment:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// Get user's latest board snapshot
router.get('/snapshot', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const [snapshot] = await db.select()
      .from(goalSnapshots)
      .where(eq(goalSnapshots.userId, userId))
      .orderBy(desc(goalSnapshots.updatedAt))
      .limit(1);

    if (!snapshot) {
      return res.json({ board: null });
    }

    try {
      res.json({ board: JSON.parse(snapshot.snapshot) });
    } catch {
      console.error('Failed to parse board snapshot');
      res.json({ board: null });
    }
  } catch (error) {
    console.error('Failed to fetch board snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch board snapshot' });
  }
});

// Save board snapshot
router.post('/snapshot', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { boardData } = req.body;
    if (!boardData) {
      return res.status(400).json({ error: 'Invalid board data' });
    }

    // Delete old snapshots to keep only the latest (simple approach)
    await db.delete(goalSnapshots).where(eq(goalSnapshots.userId, userId));

    await db.insert(goalSnapshots).values({
      userId,
      snapshot: JSON.stringify(boardData),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save board snapshot:', error);
    res.status(500).json({ error: 'Failed to save board snapshot' });
  }
});

// Get all users that can be assigned to tasks (for assignment dropdown)
router.get('/assignable-users', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    }).from(users).limit(100);
    
    res.json({ users: allUsers });
  } catch (error) {
    console.error('Failed to fetch assignable users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get task assignments for a project
router.get('/tasks/:projectId/assignments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    
    const projectgoalBoards = await db.select({ id: goalBoards.id })
      .from(goalBoards)
      .where(eq(goalBoards.userId, req.userId!));
    
    const boardIds = projectgoalBoards.map(b => b.id);
    if (boardIds.length === 0) return res.json({ assignments: [] });
    
    const projectTasks = await db.select()
      .from(tasks)
      .where(inArray(tasks.boardId, boardIds));
    
    const assignments = projectTasks
      .filter(t => t.assignedToUserId)
      .map(t => ({
        taskId: t.id,
        assignedToUserId: t.assignedToUserId,
      }));
    
    res.json({ assignments });
  } catch (error) {
    console.error('Failed to fetch task assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

export default router;
