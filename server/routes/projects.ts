import { Router, Response } from 'express';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { projectMembers, projects, users } from '../../shared/schema';

const router = Router();

const PLAN_LIMITS: Record<'free' | 'premium' | 'pro', number> = {
  free: 5,
  premium: 10,
  pro: 20,
};

type ProjectRole = 'owner' | 'member' | 'view' | 'edit' | 'full edit' | 'admin';

function getPlanTier(tier?: string | null): 'free' | 'premium' | 'pro' {
  if (tier === 'pro') return 'pro';
  if (tier === 'premium') return 'premium';
  return 'free';
}

async function getProjectMembershipCount(userId: number) {
  const rows = await db
    .select({ count: projectMembers.id })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  return rows.length;
}

async function serializeProject(projectId: number) {
  const project = await db.select().from(projects).where(eq(projects.id, projectId));
  if (project.length === 0) return null;

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId));

  return {
    ...project[0],
    members: members.map(member => ({
      id: member.id,
      name: member.name || member.email.split('@')[0],
      email: member.email,
      role: member.role as ProjectRole,
    })),
    memberCount: members.length,
  };
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select({
        id: projects.id,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projectMembers.userId, req.userId!));

    const serialised = await Promise.all(rows.map(row => serializeProject(row.id)));
    res.json({ projects: serialised.filter(Boolean) });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, color } = req.body;
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Project name must be at least 2 characters' });
    }

    const userRow = await db
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, req.userId!));
    const planTier = getPlanTier(userRow[0]?.subscriptionTier);
    const projectCount = await getProjectMembershipCount(req.userId!);

    if (projectCount >= PLAN_LIMITS[planTier]) {
      return res.status(402).json({
        error: 'PLAN_LIMIT_REACHED',
        message: `You have reached your ${planTier} plan limit of ${PLAN_LIMITS[planTier]} projects.`,
        limit: PLAN_LIMITS[planTier],
        current: projectCount,
      });
    }

    const inviteCode = crypto.randomBytes(16).toString('hex');
    const [created] = await db.insert(projects).values({
      name: String(name).trim(),
      description: String(description || '').trim(),
      color: String(color || '#3b82f6'),
      ownerId: req.userId!,
      inviteCode,
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

router.patch('/:projectId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }

    const updates: any = {};
    for (const key of ['name', 'description', 'color', 'archived', 'completed'] as const) {
      if (key in req.body) updates[key] = req.body[key];
    }

    if (typeof updates.name === 'string' && updates.name.trim().length < 2) {
      return res.status(400).json({ error: 'Project name must be at least 2 characters' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    await db.update(projects)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));

    const project = await serializeProject(projectId);
    res.json({ project });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:projectId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project[0].ownerId !== req.userId!) {
      return res.status(403).json({ error: 'Only the owner can delete this project' });
    }

    await db.delete(projects).where(eq(projects.id, projectId));
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

router.post('/:projectId/invite', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project.length === 0) return res.status(404).json({ error: 'Project not found' });

    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (membership.length === 0) return res.status(403).json({ error: 'Not a member of this project' });

    const targetUser = await db.select().from(users).where(eq(users.email, String(email).trim().toLowerCase()));
    if (targetUser.length === 0) {
      return res.status(202).json({
        message: 'Invite link generated. The user can join after creating an account.',
        inviteCode: project[0].inviteCode,
      });
    }

    const recipient = targetUser[0];
    const recipientProjectCount = await getProjectMembershipCount(recipient.id);
    const recipientPlanTier = getPlanTier(recipient.subscriptionTier);
    const recipientLimit = PLAN_LIMITS[recipientPlanTier];

    if (recipientProjectCount >= recipientLimit) {
      return res.status(402).json({
        error: 'RECIPIENT_LIMIT_REACHED',
        message: 'This user cannot join any more projects on their current plan.',
        limit: recipientLimit,
      });
    }

    const existing = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, recipient.id)));
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }

    await db.insert(projectMembers).values({
      projectId,
      userId: recipient.id,
      role: 'edit',
    });

    const projectData = await serializeProject(projectId);
    res.json({ project: projectData, message: 'User added to project' });
  } catch (error) {
    console.error('Invite project member error:', error);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

router.post('/join/:inviteCode', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { inviteCode } = req.params;
    const project = await db.select().from(projects).where(eq(projects.inviteCode, inviteCode));
    if (project.length === 0) return res.status(404).json({ error: 'Project not found' });

    const projectId = project[0].id;
    const existing = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (existing.length > 0) {
      return res.json({ project: await serializeProject(projectId) });
    }

    const userRow = await db
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, req.userId!));
    const planTier = getPlanTier(userRow[0]?.subscriptionTier);
    const currentCount = await getProjectMembershipCount(req.userId!);
    if (currentCount >= PLAN_LIMITS[planTier]) {
      return res.status(402).json({
        error: 'PLAN_LIMIT_REACHED',
        message: 'You cannot join any more projects on your current plan.',
      });
    }

    await db.insert(projectMembers).values({
      projectId,
      userId: req.userId!,
      role: 'edit',
    });

    res.json({ project: await serializeProject(projectId) });
  } catch (error) {
    console.error('Join project error:', error);
    res.status(500).json({ error: 'Failed to join project' });
  }
});

// Update member role (owner only)
router.patch('/:projectId/members/:memberId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const memberId = parseInt(req.params.memberId, 10);
    const { role } = req.body;

    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project.length === 0) return res.status(404).json({ error: 'Project not found' });
    if (project[0].ownerId !== req.userId!) {
      return res.status(403).json({ error: 'Only the owner can update member roles' });
    }

    await db.update(projectMembers)
      .set({ role, updatedAt: new Date().toISOString() })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberId)));

    const projectData = await serializeProject(projectId);
    res.json({ project: projectData, message: 'Member role updated' });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// Remove member (owner only)
router.delete('/:projectId/members/:memberId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const memberId = parseInt(req.params.memberId, 10);

    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project.length === 0) return res.status(404).json({ error: 'Project not found' });
    if (project[0].ownerId !== req.userId!) {
      return res.status(403).json({ error: 'Only the owner can remove members' });
    }

    if (memberId === req.userId!) {
      return res.status(400).json({ error: 'Owners cannot remove themselves from the project' });
    }

    await db.delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberId)));

    const projectData = await serializeProject(projectId);
    res.json({ project: projectData, message: 'Member removed from project' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Leave project (non-owner members)
router.post('/:projectId/leave', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);

    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project.length === 0) return res.status(404).json({ error: 'Project not found' });

    if (project[0].ownerId === req.userId!) {
      return res.status(400).json({ error: 'Owners cannot leave their own project. You can delete it instead.' });
    }

    await db.delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));

    res.json({ success: true, message: 'Left the project successfully' });
  } catch (error) {
    console.error('Leave project error:', error);
    res.status(500).json({ error: 'Failed to leave project' });
  }
});

// Project chat - get messages
router.get('/:projectId/chat', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (membership.length === 0) return res.status(403).json({ error: 'Access denied' });

    const result = await pool.query(
      `SELECT pcm.id, pcm.user_id as "userId", pcm.message, pcm.created_at as "createdAt", u.name as "authorName"
       FROM project_chat_messages pcm
       INNER JOIN users u ON u.id = pcm.user_id
       WHERE pcm.project_id = $1
       ORDER BY pcm.created_at ASC`,
      [projectId]
    );
    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Get project chat error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Project chat - send a message
router.post('/:projectId/chat', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (membership.length === 0) return res.status(403).json({ error: 'Access denied' });

    const { message } = req.body;
    if (!message || String(message).trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const result = await pool.query(
      `INSERT INTO project_chat_messages (project_id, user_id, message)
       VALUES ($1, $2, $3)
       RETURNING id, user_id as "userId", message, created_at as "createdAt"`,
      [projectId, req.userId!, String(message).trim()]
    );
    const msg = result.rows[0];
    const userResult = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.userId!]);
    res.json({ message: { ...msg, authorName: userResult.rows[0]?.name || 'Unknown' } });
  } catch (error) {
    console.error('Send project chat error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
