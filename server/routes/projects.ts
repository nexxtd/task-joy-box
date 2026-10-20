import { Router, Response } from 'express';
import crypto from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db, pool } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getSettingNumber } from '../lib/settings.js';
import { projectJoinRequests, projectMembers, projects, users } from '../../shared/schema.js';

const router = Router();

// --- Project chat uploads -------------------------------------------------
const CHAT_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'text/x-markdown',
  'application/zip', 'application/x-zip-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];
const CHAT_EXT = /\.(jpe?g|png|gif|webp|svg|pdf|txt|csv|md|zip|docx?|odt|xlsx?)$/i;

// memoryStorage: bytes go into project_chat_messages.attachment_data. uploads/
// is ephemeral on Render/Vercel, so a disk-only copy shows a broken image after
// a restart. multer needs a static cap; the real limit is enforced per request
// from the max_attachment_mb setting.
const uploadChatFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (CHAT_MIMES.includes(file.mimetype) || CHAT_EXT.test(file.originalname)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

function sanitizeChatFilename(name: string): string {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

const INLINE_MIME_PREFIXES = ['image/', 'application/pdf', 'text/'];

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
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  return row?.count ?? 0;
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
    const memberships = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, req.userId!));

    const projectIds = [...new Set(memberships.map(m => m.projectId))];
    if (projectIds.length === 0) return res.json({ projects: [] });

    const [projectRows, memberRows] = await Promise.all([
      db.select().from(projects).where(inArray(projects.id, projectIds)),
      db.select({
        projectId: projectMembers.projectId,
        id: users.id,
        name: users.name,
        email: users.email,
        role: projectMembers.role,
      })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(inArray(projectMembers.projectId, projectIds)),
    ]);

    const membersByProject = new Map<number, typeof memberRows>();
    memberRows.forEach(m => {
      const list = membersByProject.get(m.projectId) || [];
      list.push(m);
      membersByProject.set(m.projectId, list);
    });

    const projectById = new Map(projectRows.map(p => [p.id, p]));
    const serialised = projectIds
      .map(id => projectById.get(id))
      .filter((p): p is typeof projectRows[number] => !!p)
      .map(p => {
        const members = membersByProject.get(p.id) || [];
        return {
          ...p,
          members: members.map(member => ({
            id: member.id,
            name: member.name || member.email.split('@')[0],
            email: member.email,
            role: member.role as ProjectRole,
          })),
          memberCount: members.length,
        };
      });
    res.json({ projects: serialised });
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

    // Invites become join requests — the owner approves before they join.
    const existingRequest = await db
      .select()
      .from(projectJoinRequests)
      .where(and(eq(projectJoinRequests.projectId, projectId), eq(projectJoinRequests.userId, recipient.id)));
    if (existingRequest.length > 0 && existingRequest[0].status === 'pending') {
      return res.status(200).json({ pending: true, message: 'A join request is already waiting for approval.' });
    }
    if (existingRequest.length > 0) {
      await db.update(projectJoinRequests)
        .set({ status: 'pending', updatedAt: new Date().toISOString() })
        .where(and(eq(projectJoinRequests.projectId, projectId), eq(projectJoinRequests.userId, recipient.id)));
    } else {
      await db.insert(projectJoinRequests).values({
        projectId,
        userId: recipient.id,
        status: 'pending',
      });
    }

    res.json({ pending: true, message: 'Invite sent — they will join once the owner approves the request.' });
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

    // Joining via link creates a request — the owner approves before you join.
    const existingRequest = await db
      .select()
      .from(projectJoinRequests)
      .where(and(eq(projectJoinRequests.projectId, projectId), eq(projectJoinRequests.userId, req.userId!)));
    if (existingRequest.length > 0 && existingRequest[0].status === 'pending') {
      return res.json({
        pending: true,
        project: { id: projectId, name: project[0].name },
        message: 'Your join request is already waiting for approval.',
      });
    }
    if (existingRequest.length > 0) {
      await db.update(projectJoinRequests)
        .set({ status: 'pending', updatedAt: new Date().toISOString() })
        .where(and(eq(projectJoinRequests.projectId, projectId), eq(projectJoinRequests.userId, req.userId!)));
    } else {
      await db.insert(projectJoinRequests).values({
        projectId,
        userId: req.userId!,
        status: 'pending',
      });
    }

    res.json({
      pending: true,
      project: { id: projectId, name: project[0].name },
      message: 'Join request sent — the project owner will review it.',
    });
  } catch (error) {
    console.error('Join project error:', error);
    res.status(500).json({ error: 'Failed to join project' });
  }
});

// List pending join requests (owner only)
router.get('/:projectId/join-requests', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);

    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project.length === 0) return res.status(404).json({ error: 'Project not found' });
    if (project[0].ownerId !== req.userId!) {
      return res.status(403).json({ error: 'Only the owner can review join requests' });
    }

    const rows = await db
      .select({
        id: projectJoinRequests.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        status: projectJoinRequests.status,
        createdAt: projectJoinRequests.createdAt,
      })
      .from(projectJoinRequests)
      .innerJoin(users, eq(users.id, projectJoinRequests.userId))
      .where(and(eq(projectJoinRequests.projectId, projectId), eq(projectJoinRequests.status, 'pending')));

    res.json({
      requests: rows.map(r => ({
        id: r.id,
        userId: r.userId,
        name: r.name || r.email.split('@')[0],
        email: r.email,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('List join requests error:', error);
    res.status(500).json({ error: 'Failed to load join requests' });
  }
});

// Approve a join request (owner only) — the user becomes a member.
router.post('/:projectId/join-requests/:requestId/approve', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const requestId = parseInt(req.params.requestId, 10);

    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project.length === 0) return res.status(404).json({ error: 'Project not found' });
    if (project[0].ownerId !== req.userId!) {
      return res.status(403).json({ error: 'Only the owner can approve join requests' });
    }

    const rows = await db
      .select()
      .from(projectJoinRequests)
      .where(and(eq(projectJoinRequests.id, requestId), eq(projectJoinRequests.projectId, projectId)));
    if (rows.length === 0 || rows[0].status !== 'pending') {
      return res.status(404).json({ error: 'Join request not found' });
    }

    const requesterId = rows[0].userId;
    const alreadyMember = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, requesterId)));
    if (alreadyMember.length === 0) {
      const userRow = await db
        .select({ subscriptionTier: users.subscriptionTier })
        .from(users)
        .where(eq(users.id, requesterId));
      const planTier = getPlanTier(userRow[0]?.subscriptionTier);
      const currentCount = await getProjectMembershipCount(requesterId);
      if (currentCount >= PLAN_LIMITS[planTier]) {
        return res.status(402).json({
          error: 'RECIPIENT_LIMIT_REACHED',
          message: 'This user cannot join any more projects on their current plan.',
        });
      }
      await db.insert(projectMembers).values({
        projectId,
        userId: requesterId,
        role: 'edit',
      });
    }

    await db.update(projectJoinRequests)
      .set({ status: 'approved', updatedAt: new Date().toISOString() })
      .where(eq(projectJoinRequests.id, requestId));

    res.json({ project: await serializeProject(projectId), message: 'Join request approved' });
  } catch (error) {
    console.error('Approve join request error:', error);
    res.status(500).json({ error: 'Failed to approve join request' });
  }
});

// Deny a join request (owner only) — the user does not become a member.
router.post('/:projectId/join-requests/:requestId/deny', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const requestId = parseInt(req.params.requestId, 10);

    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project.length === 0) return res.status(404).json({ error: 'Project not found' });
    if (project[0].ownerId !== req.userId!) {
      return res.status(403).json({ error: 'Only the owner can deny join requests' });
    }

    const rows = await db
      .select()
      .from(projectJoinRequests)
      .where(and(eq(projectJoinRequests.id, requestId), eq(projectJoinRequests.projectId, projectId)));
    if (rows.length === 0 || rows[0].status !== 'pending') {
      return res.status(404).json({ error: 'Join request not found' });
    }

    await db.update(projectJoinRequests)
      .set({ status: 'denied', updatedAt: new Date().toISOString() })
      .where(eq(projectJoinRequests.id, requestId));

    res.json({ ok: true, message: 'Join request denied' });
  } catch (error) {
    console.error('Deny join request error:', error);
    res.status(500).json({ error: 'Failed to deny join request' });
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
      `SELECT pcm.id, pcm.user_id as "userId", pcm.message, pcm.created_at as "createdAt", u.name as "authorName",
              pcm.attachment_name as "attachmentName", pcm.attachment_type as "attachmentType",
              pcm.attachment_size as "attachmentSize", pcm.linked_type as "linkedType",
              pcm.linked_id as "linkedId", pcm.linked_title as "linkedTitle", pcm.linked_column as "linkedColumn"
       FROM project_chat_messages pcm
       INNER JOIN users u ON u.id = pcm.user_id
       WHERE pcm.project_id = $1
       ORDER BY pcm.created_at ASC
       LIMIT 200`,
      [projectId]
    );
    // attachment_data stays in the DB — expose an authenticated URL instead so
    // the message list never ships megabytes of base64.
    res.json({
      messages: result.rows.map((row: any) => ({
        ...row,
        attachmentUrl: row.attachmentName ? `/api/projects/${projectId}/chat/message/${row.id}/attachment` : null,
      })),
    });
  } catch (error) {
    console.error('Get project chat error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Project chat - download an attachment
router.get('/:projectId/chat/message/:messageId/attachment', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (membership.length === 0) return res.status(403).json({ error: 'Access denied' });

    const result = await pool.query(
      `SELECT attachment_name, attachment_type, attachment_data
       FROM project_chat_messages
       WHERE id = $1 AND project_id = $2`,
      [messageId, projectId]
    );
    const row = result.rows[0];
    if (!row || !row.attachment_data) return res.status(404).json({ error: 'Attachment not found' });

    const mimeType = row.attachment_type || 'application/octet-stream';
    const fileName = sanitizeChatFilename(row.attachment_name || 'file');
    const isInline = INLINE_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=604800');
    res.end(Buffer.from(row.attachment_data, 'base64'));
  } catch (error) {
    console.error('Download project chat attachment error:', error);
    res.status(500).json({ error: 'Failed to get attachment' });
  }
});

// Project chat - send a message (multipart so a file/image can ride along)
router.post('/:projectId/chat', requireAuth, uploadChatFile.single('file'), async (req: any, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const membership = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.userId!)));
    if (membership.length === 0) return res.status(403).json({ error: 'Access denied' });

    const text = String(req.body?.message ?? '').trim();
    const file = req.file as Express.Multer.File | undefined;
    if (!text && !file) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (file) {
      const maxMb = await getSettingNumber('max_attachment_mb', 25);
      if (file.size > Math.max(1, maxMb) * 1024 * 1024) {
        return res.status(413).json({
          error: 'FILE_TOO_LARGE',
          message: `Attachment exceeds the ${maxMb} MB limit`,
          limitMb: maxMb,
        });
      }
    }

    const linkedTypeRaw = String(req.body?.linkedType ?? '').trim();
    const linkedType = linkedTypeRaw === 'task' || linkedTypeRaw === 'note' ? linkedTypeRaw : null;
    const linkedId = linkedType ? String(req.body?.linkedId ?? '').trim() : '';
    const linkedTitle = linkedType ? String(req.body?.linkedTitle ?? '').trim().slice(0, 300) : null;
    const linkedColumn = linkedType ? String(req.body?.linkedColumn ?? '').trim().slice(0, 120) || null : null;
    // Without an id there is nothing to link to.
    const useLink = Boolean(linkedType && linkedId);

    const result = await pool.query(
      `INSERT INTO project_chat_messages
         (project_id, user_id, message, attachment_name, attachment_type, attachment_size, attachment_data,
          linked_type, linked_id, linked_title, linked_column)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, user_id as "userId", message, created_at as "createdAt",
                 attachment_name as "attachmentName", attachment_type as "attachmentType",
                 attachment_size as "attachmentSize", linked_type as "linkedType",
                 linked_id as "linkedId", linked_title as "linkedTitle", linked_column as "linkedColumn"`,
      [
        projectId,
        req.userId!,
        text || (file ? file.originalname : ''),
        file ? sanitizeChatFilename(file.originalname) : null,
        file ? file.mimetype : null,
        file ? file.size : null,
        file ? file.buffer.toString('base64') : null,
        useLink ? linkedType : null,
        useLink ? linkedId : null,
        useLink ? linkedTitle : null,
        useLink ? linkedColumn : null,
      ]
    );
    const msg: any = result.rows[0];
    if (file) {
      // Best-effort disk copy for parity with ticket uploads; the DB copy above
      // is what actually gets served.
      try {
        const dir = process.env.VERCEL === '1'
          ? path.join('/tmp', 'uploads', 'project-chat')
          : path.join(process.cwd(), 'uploads', 'project-chat');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const ext = path.extname(sanitizeChatFilename(file.originalname)).replace(/[^a-zA-Z0-9.]/g, '');
        fs.writeFileSync(path.join(dir, `${msg.id}${ext}`), file.buffer);
      } catch { /* DB copy is the source of truth */ }
    }
    const userResult = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.userId!]);
    res.json({
      message: {
        ...msg,
        authorName: userResult.rows[0]?.name || 'Unknown',
        attachmentUrl: msg.attachmentName ? `/api/projects/${projectId}/chat/message/${msg.id}/attachment` : null,
      },
    });
  } catch (error) {
    console.error('Send project chat error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
