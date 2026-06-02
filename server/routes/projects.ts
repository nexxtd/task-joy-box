import express from 'express';
import { eq, and, or, asc, inArray } from 'drizzle-orm';
import { db } from '../db';
import { projects, projectMembers, projectColumns, tasks as taskSchema, users } from '../../shared/schema';
import crypto from 'crypto';

const router = express.Router();

// Get all projects for the current user
router.get('/', async (req: any, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get projects where user is a member
    const projectMemberships = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, req.userId));

    const projectIds = projectMemberships.map(p => p.projectId);
    
    let projectsData = [];
    if (projectIds.length > 0) {
      projectsData = await db
        .select()
        .from(projects)
        .where(
          or(
            eq(projects.ownerId, req.userId), // Owned projects
            inArray(projects.id, projectIds)  // Member projects
          )
        )
        .orderBy(asc(projects.order));
    } else {
      // If user is not a member of any projects, only show owned projects
      projectsData = await db
        .select()
        .from(projects)
        .where(eq(projects.ownerId, req.userId))
        .orderBy(asc(projects.order));
    }

    res.json({ projects: projectsData });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

// Create a new project
router.post('/', async (req: any, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, description, color, order } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Project name must be at least 2 characters' });
    }

    // Check project limit for free users
    const existingProjects = await db
      .select()
      .from(projects)
      .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.userId, req.userId), eq(projects.archived, false)));

    const tier = req.user?.subscriptionTier || 'free';
    const limit = tier === 'pro' ? 20 : tier === 'premium' ? 10 : 5;

    if (existingProjects.length >= limit) {
      return res.status(402).json({ error: `Project limit reached for ${tier} plan` });
    }

    const inviteCode = crypto.randomBytes(16).toString('hex');
    const [created] = await db.insert(projects).values({
      name: String(name).trim(),
      description: String(description || '').trim(),
      color: String(color || '#3b82f6'),
      ownerId: req.userId!,
      inviteCode,
      order: order || 0,
    }).returning();

    await db.insert(projectMembers).values({
      projectId: created.id,
      userId: req.userId!,
      role: 'owner',
    });

    const project = await serializeProject(created.id);
    res.json({ project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update a project
router.patch('/:projectId', async (req: any, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is the owner of the project
    const [project] = await db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only project owner can update the project' });
    }

    const updates = req.body;
    await db
      .update(projects)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));

    const [updatedProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    res.json({ project: updatedProject });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete a project
router.delete('/:projectId', async (req: any, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is the owner of the project
    const [project] = await db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only project owner can delete the project' });
    }

    await db.delete(projects).where(eq(projects.id, projectId));
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Invite a member to a project
router.post('/:projectId/invite', async (req: any, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const { email } = req.body;
    
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is the owner of the project
    const [project] = await db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only project owner can invite members' });
    }

    // Find the user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already a member
    const existingMembership = await db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, user.id)
      ));

    if (existingMembership.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }

    // Add user as a member
    const [member] = await db
      .insert(projectMembers)
      .values({
        projectId,
        userId: user.id,
        role: 'member',
      })
      .returning();

    res.json({ member });
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});


// Remove a member from a project
router.delete('/:projectId/members/:userId', async (req: any, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const userId = parseInt(req.params.userId, 10);
    
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is the owner of the project
    const [project] = await db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only project owner can remove members' });
    }

    // Don't allow removing the owner
    if (userId === project.ownerId) {
      return res.status(400).json({ error: 'Cannot remove the project owner' });
    }

    await db
      .delete(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ));

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Add project column
router.post('/:projectId/columns', async (req: any, res) => {
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
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }

    const [column] = await db.insert(projectColumns).values({
      projectId,
      title,
      order: order || 0,
      color: color || '#9CA3AF',
    }).returning();

    res.json({ column });
  } catch (error) {
    console.error('Add column error:', error);
    res.status(500).json({ error: 'Failed to add column' });
  }
});

// Update project column
router.patch('/:projectId/columns/:columnId', async (req: any, res) => {
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
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }

    await db.update(projectColumns)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(and(eq(projectColumns.id, columnId), eq(projectColumns.projectId, projectId)));

    const [updatedColumn] = await db
      .select()
      .from(projectColumns)
      .where(and(eq(projectColumns.id, columnId), eq(projectColumns.projectId, projectId)));

    res.json({ column: updatedColumn });
  } catch (error) {
    console.error('Update column error:', error);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

// Delete project column
router.delete('/:projectId/columns/:columnId', async (req: any, res) => {
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
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }

    await db.delete(projectColumns)
      .where(and(eq(projectColumns.id, columnId), eq(projectColumns.projectId, projectId)));

    res.json({ message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Delete column error:', error);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});


// Reorder projects
router.patch('/reorder', async (req: any, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projects: orderedProjects } = req.body;

    if (!Array.isArray(orderedProjects)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // Verify that all projects belong to the user
    for (const project of orderedProjects) {
      const [proj] = await db
        .select({ ownerId: projects.ownerId })
        .from(projects)
        .where(eq(projects.id, project.id));

      if (!proj || proj.ownerId !== req.userId) {
        return res.status(403).json({ error: 'Unauthorized to reorder some projects' });
      }
    }

    // Update the order for each project
    for (const project of orderedProjects) {
      await db
        .update(projects)
        .set({ order: project.order, updatedAt: new Date().toISOString() })
        .where(eq(projects.id, project.id));
    }

    res.json({ message: 'Projects reordered successfully' });
  } catch (error) {
    console.error('Reorder projects error:', error);
    res.status(500).json({ error: 'Failed to reorder projects' });
  }
});

export default router;