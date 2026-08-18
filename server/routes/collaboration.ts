import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { users, workspaces, workspaceMembers, tasks, sharedTasks, chatMessages, groups, groupMembers, type InsertChatMessage } from '../../shared/schema.js';
import { eq, and, desc, or } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { encrypt, decrypt } from '../lib/encryption.js';

const router = Router();

// Get shared tasks for workspace or specific group
router.get('/workspace/:workspaceId/tasks', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { groupId } = req.query;

    const membership = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, parseInt(workspaceId)), eq(workspaceMembers.userId, req.userId!)));

    if (membership.length === 0) return res.status(403).json({ error: 'Not a member of this workspace' });

    let taskRows;
    if (groupId) {
      taskRows = await db.select().from(sharedTasks)
        .where(and(eq(sharedTasks.workspaceId, parseInt(workspaceId)), eq(sharedTasks.assignedToGroupId, parseInt(groupId as string))))
        .orderBy(desc(sharedTasks.createdAt));
    } else {
      taskRows = await db.select().from(sharedTasks)
        .where(eq(sharedTasks.workspaceId, parseInt(workspaceId)))
        .orderBy(desc(sharedTasks.createdAt));
    }

    const decrypted = taskRows.map(t => ({
      ...t,
      title: decrypt(t.title) ?? t.title,
      description: t.description ? (decrypt(t.description) ?? t.description) : t.description,
    }));

    res.json({ tasks: decrypted });
  } catch (error) {
    console.error('Get shared tasks error:', error);
    res.status(500).json({ error: 'Failed to get shared tasks' });
  }
});

// Create a shared task
router.post('/workspace/:workspaceId/task', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { title, description, assignedToUserId, assignedToGroupId, priority, dueDate } = req.body;

    const membership = await db.select().from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, parseInt(workspaceId)), eq(workspaceMembers.userId, req.userId!)));

    if (membership.length === 0) return res.status(403).json({ error: 'Not a member of this workspace' });
    if (!title) return res.status(400).json({ error: 'Task title is required' });

    const [newTask] = await db.insert(sharedTasks).values({
      workspaceId: parseInt(workspaceId),
      title: encrypt(title) ?? title,
      description: description ? (encrypt(description) ?? description) : '',
      assignedToUserId: assignedToUserId || null,
      assignedToGroupId: assignedToGroupId || null,
      createdByUserId: req.userId!,
      priority: priority || 'none',
      dueDate: dueDate || null,
    }).returning();

    res.json({
      task: {
        ...newTask,
        title: decrypt(newTask.title) ?? newTask.title,
        description: newTask.description ? (decrypt(newTask.description) ?? newTask.description) : newTask.description,
      }
    });
  } catch (error) {
    console.error('Create shared task error:', error);
    res.status(500).json({ error: 'Failed to create shared task' });
  }
});

// Update a shared task
router.put('/workspace/:workspaceId/task/:taskId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, taskId } = req.params;
    const { title, description, assignedToUserId, assignedToGroupId, priority, dueDate, status } = req.body;

    const membership = await db.select().from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, parseInt(workspaceId)), eq(workspaceMembers.userId, req.userId!)));

    if (membership.length === 0) return res.status(403).json({ error: 'Not a member of this workspace' });

    const task = await db.select().from(sharedTasks)
      .where(and(eq(sharedTasks.id, parseInt(taskId)), eq(sharedTasks.workspaceId, parseInt(workspaceId))));

    if (task.length === 0) return res.status(404).json({ error: 'Task not found in this workspace' });

    const updatedValues: any = {};
    if (title) updatedValues.title = encrypt(title) ?? title;
    if (description !== undefined) updatedValues.description = description ? (encrypt(description) ?? description) : description;
    if (assignedToUserId !== undefined) updatedValues.assignedToUserId = assignedToUserId;
    if (assignedToGroupId !== undefined) updatedValues.assignedToGroupId = assignedToGroupId;
    if (priority) updatedValues.priority = priority;
    if (dueDate !== undefined) updatedValues.dueDate = dueDate;
    if (status) updatedValues.status = status;

    const [updatedTask] = await db.update(sharedTasks)
      .set(updatedValues)
      .where(eq(sharedTasks.id, parseInt(taskId)))
      .returning();

    res.json({
      task: {
        ...updatedTask,
        title: decrypt(updatedTask.title) ?? updatedTask.title,
        description: updatedTask.description ? (decrypt(updatedTask.description) ?? updatedTask.description) : updatedTask.description,
      }
    });
  } catch (error) {
    console.error('Update shared task error:', error);
    res.status(500).json({ error: 'Failed to update shared task' });
  }
});

// Delete a shared task
router.delete('/workspace/:workspaceId/task/:taskId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, taskId } = req.params;

    const membership = await db.select().from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, parseInt(workspaceId)), eq(workspaceMembers.userId, req.userId!)));

    if (membership.length === 0) return res.status(403).json({ error: 'Not a member of this workspace' });

    const task = await db.select().from(sharedTasks)
      .where(and(eq(sharedTasks.id, parseInt(taskId)), eq(sharedTasks.workspaceId, parseInt(workspaceId))));

    if (task.length === 0) return res.status(404).json({ error: 'Task not found in this workspace' });

    const workspace = await db.select().from(workspaces).where(eq(workspaces.id, parseInt(workspaceId)));
    const isWorkspaceOwner = workspace.length > 0 && workspace[0].ownerId === req.userId!;
    const isTaskCreator = task.length > 0 && task[0].createdByUserId === req.userId!;

    if (!isWorkspaceOwner && !isTaskCreator) {
      return res.status(403).json({ error: 'Only workspace owner or task creator can delete this task' });
    }

    await db.delete(sharedTasks).where(eq(sharedTasks.id, parseInt(taskId)));
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete shared task error:', error);
    res.status(500).json({ error: 'Failed to delete shared task' });
  }
});

// Get chat messages
router.get('/workspace/:workspaceId/chat', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { groupId } = req.query;

    const membership = await db.select().from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, parseInt(workspaceId)), eq(workspaceMembers.userId, req.userId!)));

    if (membership.length === 0) return res.status(403).json({ error: 'Not a member of this workspace' });

    if (groupId) {
      const groupMembership = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, parseInt(groupId as string)), eq(groupMembers.userId, req.userId!)));
      if (groupMembership.length === 0) return res.status(403).json({ error: 'Not a member of this group' });
    }

    let messages;
    if (groupId) {
      messages = await db.select({
        id: chatMessages.id,
        userId: chatMessages.userId,
        message: chatMessages.message,
        messageType: chatMessages.messageType,
        createdAt: chatMessages.createdAt,
        userName: users.name,
      }).from(chatMessages)
        .innerJoin(users, eq(users.id, chatMessages.userId))
        .where(and(eq(chatMessages.workspaceId, parseInt(workspaceId)), eq(chatMessages.groupId, parseInt(groupId as string))))
        .orderBy(chatMessages.createdAt);
    } else {
      messages = await db.select({
        id: chatMessages.id,
        userId: chatMessages.userId,
        message: chatMessages.message,
        messageType: chatMessages.messageType,
        createdAt: chatMessages.createdAt,
        userName: users.name,
      }).from(chatMessages)
        .innerJoin(users, eq(users.id, chatMessages.userId))
        .where(and(
          eq(chatMessages.workspaceId, parseInt(workspaceId)),
          or(eq(chatMessages.groupId, -1), eq(chatMessages.userId, req.userId!))
        ))
        .orderBy(chatMessages.createdAt);
    }

    const decrypted = messages.map(m => ({
      ...m,
      message: decrypt(m.message) ?? m.message,
    }));

    res.json({ messages: decrypted });
  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ error: 'Failed to get chat messages' });
  }
});

// Send a chat message
router.post('/workspace/:workspaceId/chat', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { message, messageType, groupId } = req.body;

    if (!message || message.trim().length === 0) return res.status(400).json({ error: 'Message is required' });

    const membership = await db.select().from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, parseInt(workspaceId)), eq(workspaceMembers.userId, req.userId!)));

    if (membership.length === 0) return res.status(403).json({ error: 'Not a member of this workspace' });

    let actualGroupId: number | null = null;
    if (groupId) {
      const groupMembership = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, parseInt(groupId)), eq(groupMembers.userId, req.userId!)));
      if (groupMembership.length === 0) return res.status(403).json({ error: 'Not a member of this group' });
      actualGroupId = parseInt(groupId);
    }

    const [newMessage] = await db.insert(chatMessages).values({
      workspaceId: parseInt(workspaceId),
      groupId: actualGroupId,
      userId: req.userId!,
      message: encrypt(message.trim()) ?? message.trim(),
      messageType: (messageType || 'text') as any,
    } as InsertChatMessage).returning();

    res.json({
      message: {
        ...newMessage,
        message: decrypt(newMessage.message) ?? newMessage.message,
      }
    });
  } catch (error) {
    console.error('Send chat message error:', error);
    res.status(500).json({ error: 'Failed to send chat message' });
  }
});

// Get user's subscription info
router.get('/subscription', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.select({ subscriptionTier: users.subscriptionTier }).from(users).where(eq(users.id, req.userId!)).limit(1);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ subscriptionTier: user[0].subscriptionTier || 'free' });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription info' });
  }
});

export default router;