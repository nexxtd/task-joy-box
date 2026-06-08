import { Router, Response } from 'express';
import { db } from '../db';
import { boardSnapshots, tasks, boards, users, columns } from '../../shared/schema';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Get user's latest board snapshot
router.get('/snapshot', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const [snapshot] = await db.select()
      .from(boardSnapshots)
      .where(eq(boardSnapshots.userId, userId))
      .orderBy(desc(boardSnapshots.updatedAt))
      .limit(1);

    if (!snapshot) {
      return res.json({ board: null });
    }

    // Parse the snapshot and enrich tasks with user info for assignments
    let boardData = JSON.parse(snapshot.snapshot);
    
    // Get all assigned users for the tasks
    if (boardData && boardData.tasks) {
      const assignedUserIds = boardData.tasks
        .filter((task: any) => task.assignedToUserId)
        .map((task: any) => task.assignedToUserId);
      
      if (assignedUserIds.length > 0) {
        const assignedUsers = await db.select({ 
          id: users.id, 
          name: users.name, 
          avatarUrl: users.avatarUrl 
        }).from(users).where(inArray(users.id, assignedUserIds));
        
        // Map user info to tasks
        boardData.tasks = boardData.tasks.map((task: any) => {
          if (task.assignedToUserId) {
            const assignedUser = assignedUsers.find(u => u.id === task.assignedToUserId);
            return {
              ...task,
              assignedTo: assignedUser || null
            };
          }
          return {
            ...task,
            assignedTo: null
          };
        });
      } else {
        boardData.tasks = boardData.tasks.map((task: any) => ({
          ...task,
          assignedTo: null
        }));
      }
    }

    res.json({ board: boardData });
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
    await db.delete(boardSnapshots).where(eq(boardSnapshots.userId, userId));

    await db.insert(boardSnapshots).values({
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
    
    const projectBoards = await db.select({ id: boards.id })
      .from(boards)
      .where(eq(boards.userId, req.userId!));
    
    const boardIds = projectBoards.map(b => b.id);
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

// Update task assignment
router.put('/tasks/:taskId/assignment', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const { assignedToUserId } = req.body;
    
    // Verify that the task belongs to the user
    const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task.length || task[0].boardId === null) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Check if the user has permission to edit this task (basic check)
    const taskBoard = await db.select().from(boards).where(eq(boards.id, task[0].boardId!)).limit(1);
    if (!taskBoard.length || taskBoard[0].userId !== req.userId!) {
      return res.status(403).json({ error: 'Not authorized to edit this task' });
    }
    
    // Update the task assignment
    await db.update(tasks)
      .set({ 
        assignedToUserId: assignedToUserId || null,
        updatedAt: new Date().toISOString()
      })
      .where(eq(tasks.id, taskId));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update task assignment:', error);
    res.status(500).json({ error: 'Failed to update task assignment' });
  }
});

export default router;