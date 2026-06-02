import express from 'express';
import { eq, and, or, asc, desc } from 'drizzle-orm';
import { db } from '../db';
import { tasks as taskSchema, columns, boards, projectMembers, projects } from '../../shared/schema';

const router = express.Router();

// Get all tasks for the user
router.get('/', async (req: any, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all tasks associated with projects the user is a member of, plus tasks not associated with any project
    const userProjects = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, req.userId));

    const projectIds = userProjects.map(p => p.projectId);
    
    let tasks;
    if (projectIds.length > 0) {
      tasks = await db
        .select()
        .from(taskSchema)
        .where(
          or(
            ...projectIds.map(id => eq(taskSchema.projectId, id)),
            eq(taskSchema.projectId, null)
          )
        )
        .orderBy(asc(taskSchema.order));
    } else {
      tasks = await db
        .select()
        .from(taskSchema)
        .where(eq(taskSchema.projectId, null))
        .orderBy(asc(taskSchema.order));
    }

    res.json({ tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

// Create a new task
router.post('/', async (req: any, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      title,
      description,
      status,
      priority,
      dueDate,
      dueTime,
      subject,
      color,
      icon,
      duration,
      columnId,
      order,
      labels,
      checklists,
      subtasks,
      attachments,
      comments,
      projectId, // New field for project association
    } = req.body;

    if (!title || !columnId) {
      return res.status(400).json({ error: 'Title and columnId are required' });
    }

    // If the task is associated with a project, verify the user is a member of that project
    if (projectId) {
      const membership = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, req.userId)
        ));

      if (membership.length === 0) {
        return res.status(403).json({ error: 'Not a member of the specified project' });
      }
      
      // Verify that the columnId corresponds to a project column
      const projectColumn = await db
        .select()
        .from(columns)
        .where(and(
          eq(columns.id, parseInt(columnId)),
          eq(columns.boardId, (await db.select().from(projects).where(eq(projects.id, projectId)))[0].id)
        ));
      
      if (projectColumn.length === 0) {
        return res.status(400).json({ error: 'Invalid column for the specified project' });
      }
    }

    const [task] = await db
      .insert(taskSchema)
      .values({
        title,
        description: description || '',
        status: status || 'to_do',
        priority: priority || 'none',
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        subject: subject || null,
        color: color || null,
        icon: icon || null,
        duration: duration || null,
        columnId: parseInt(columnId),
        order: order || 0,
        completed: false,
        completedAt: null,
        labels: labels || [],
        checklists: checklists || [],
        subtasks: subtasks || [],
        attachments: attachments || [],
        comments: comments || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        projectId: projectId || null, // Associate with project
      })
      .returning();

    res.json({ task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update a task
router.patch('/:taskId', async (req: any, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updates = req.body;

    // If the task is being moved to a different project, verify the user has access to both projects
    if (updates.projectId) {
      const task = await db
        .select({ projectId: taskSchema.projectId })
        .from(taskSchema)
        .where(eq(taskSchema.id, taskId));

      if (task.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Verify user has access to the new project
      const newProjectMembership = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, updates.projectId),
          eq(projectMembers.userId, req.userId)
        ));

      if (newProjectMembership.length === 0) {
        return res.status(403).json({ error: 'Not a member of the specified project' });
      }

      // If the task was previously associated with a project, verify access to that project too
      if (task[0].projectId && task[0].projectId !== updates.projectId) {
        const oldProjectMembership = await db
          .select()
          .from(projectMembers)
          .where(and(
            eq(projectMembers.projectId, task[0].projectId),
            eq(projectMembers.userId, req.userId)
          ));

        if (oldProjectMembership.length === 0) {
          return res.status(403).json({ error: 'Not a member of the original project' });
        }
      }
    }

    await db
      .update(taskSchema)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(taskSchema.id, taskId));

    const [updatedTask] = await db
      .select()
      .from(taskSchema)
      .where(eq(taskSchema.id, taskId));

    res.json({ task: updatedTask });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete a task
router.delete('/:taskId', async (req: any, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the task to check if it belongs to a project the user has access to
    const [task] = await db
      .select({ projectId: taskSchema.projectId })
      .from(taskSchema)
      .where(eq(taskSchema.id, taskId));

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // If the task belongs to a project, verify user is a member of that project
    if (task.projectId) {
      const membership = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, task.projectId),
          eq(projectMembers.userId, req.userId)
        ));

      if (membership.length === 0) {
        return res.status(403).json({ error: 'Not a member of the project containing this task' });
      }
    }

    await db.delete(taskSchema).where(eq(taskSchema.id, taskId));
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;