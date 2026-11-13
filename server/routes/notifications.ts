import { Router, Response } from 'express';
import { db } from '../db.js';
import { pendingUserChanges, userNotifications, users, userSettings, projectJoinRequests, projectMembers, projects } from '../../shared/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { normalizeLanguageCode } from '../lib/language.js';
import { SERVER_PLAN_LIMITS } from '../lib/tier.js';
import { resolveEffectiveUserPlan } from '../lib/orgLifecycle.js';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(requireAuth);

const PLAN_LIMITS = SERVER_PLAN_LIMITS.projects;

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

async function applyPendingChange(pending: any) {
  const payload = (() => {
    try { return JSON.parse(pending.payload); } catch { return {}; }
  })();
  const userId = pending.userId;
  const updateData: any = {};
  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.email !== undefined) updateData.email = payload.email;
  if (payload.password !== undefined) updateData.passwordHash = await bcrypt.hash(payload.password, 12);
  if (payload.tier !== undefined) {
    updateData.subscriptionTier = payload.tier;
    const status = payload.status;
    updateData.subscriptionStatus = payload.tier === 'free' && status === undefined ? 'inactive' : (status || (payload.tier === 'free' ? 'inactive' : 'active'));
  } else if (payload.status !== undefined) {
    updateData.subscriptionStatus = payload.status;
  }
  if (payload.location !== undefined) updateData.location = payload.location || null;

  if (Object.keys(updateData).length > 0) {
    await db.update(users).set(updateData).where(eq(users.id, userId));
  }
  if (payload.language !== undefined) {
    const language = normalizeLanguageCode(payload.language);
    const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (existing.length > 0) {
      await db.update(userSettings).set({ language }).where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({ userId, language });
    }
  }
}

async function autoApproveExpired(userId: number) {
  try {
    const pendings = await db.select().from(pendingUserChanges).where(and(eq(pendingUserChanges.userId, userId), eq(pendingUserChanges.status, 'pending')));
    const now = new Date();
    for (const p of pendings as any[]) {
      try {
        const expires = new Date((p as any).expiresAt);
        if (expires < now) {
          await applyPendingChange(p);
          await db.update(pendingUserChanges).set({ status: 'auto_approved', resolvedAt: new Date().toISOString() as any }).where(eq(pendingUserChanges.id, p.id));
          await db.insert(userNotifications).values({
            userId,
            type: 'change_auto_approved',
            title: 'Change auto-approved',
            message: `Your pending ${p.changeType} change was auto-approved after 24 hours.`,
            data: JSON.stringify({ pendingId: p.id, changeType: p.changeType }),
            read: false,
          } as any);
        }
      } catch (e) {
        console.error('autoApprove item failed', p?.id, e);
      }
    }
  } catch (e) {
    console.error('autoApproveExpired failed', e);
  }
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    try { await autoApproveExpired(userId); } catch {}
    let pendings: any[] = [];
    let notifs: any[] = [];
    try {
      pendings = await db.select().from(pendingUserChanges).where(and(eq(pendingUserChanges.userId, userId), eq(pendingUserChanges.status, 'pending'))).orderBy(desc(pendingUserChanges.createdAt));
    } catch (e) { console.error('pendings fetch failed', e); pendings = []; }
    try {
      notifs = await db.select().from(userNotifications).where(eq(userNotifications.userId, userId)).orderBy(desc(userNotifications.createdAt)).limit(20);
    } catch (e) { console.error('notifs fetch failed', e); notifs = []; }
    res.json({ pendings, notifications: notifs });
  } catch (e) {
    console.error('Failed to fetch notifications', e);
    res.json({ pendings: [], notifications: [] });
  }
});

router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.userId!;
    const [pending] = await db.select().from(pendingUserChanges).where(and(eq(pendingUserChanges.id, id), eq(pendingUserChanges.userId, userId))).limit(1);
    if (!pending) return res.status(404).json({ error: 'Not found' });
    if ((pending as any).status !== 'pending') return res.status(400).json({ error: 'Already resolved' });
    const expires = new Date((pending as any).expiresAt);
    if (expires < new Date()) {
      await applyPendingChange(pending);
      await db.update(pendingUserChanges).set({ status: 'auto_approved', resolvedAt: new Date().toISOString() as any }).where(eq(pendingUserChanges.id, id));
      return res.json({ success: true, autoApproved: true });
    }
    await applyPendingChange(pending);
    await db.update(pendingUserChanges).set({ status: 'approved', resolvedAt: new Date().toISOString() as any }).where(eq(pendingUserChanges.id, id));
    await db.insert(userNotifications).values({
      userId,
      type: 'change_approved',
      title: 'Change approved',
      message: `You approved the ${ (pending as any).changeType } change.`,
      data: JSON.stringify({ pendingId: id }),
      read: false,
    } as any);
    res.json({ success: true });
  } catch (e) {
    console.error('Approve failed', e);
    res.status(500).json({ error: 'Failed to approve' });
  }
});

router.post('/:id/deny', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.userId!;
    const [pending] = await db.select().from(pendingUserChanges).where(and(eq(pendingUserChanges.userId, userId), eq(pendingUserChanges.id, id))).limit(1);
    if (!pending) return res.status(404).json({ error: 'Not found' });
    if ((pending as any).status !== 'pending') return res.status(400).json({ error: 'Already resolved' });
    await db.update(pendingUserChanges).set({ status: 'denied', resolvedAt: new Date().toISOString() as any }).where(eq(pendingUserChanges.id, id));
    await db.insert(userNotifications).values({
      userId,
      type: 'change_denied',
      title: 'Change denied',
      message: `You denied the ${(pending as any).changeType} change.`,
      data: JSON.stringify({ pendingId: id }),
      read: false,
    } as any);
    res.json({ success: true });
  } catch (e) {
    console.error('Deny failed', e);
    res.status(500).json({ error: 'Failed to deny' });
  }
});

router.post('/project-invite/:requestId/:action', async (req: AuthRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    const action = req.params.action;
    if (action !== 'accept' && action !== 'decline') {
      return res.status(400).json({ error: 'Invalid action' });
    }
    const userId = req.userId!;

    const [request] = await db
      .select()
      .from(projectJoinRequests)
      .where(and(eq(projectJoinRequests.id, requestId), eq(projectJoinRequests.userId, userId)))
      .limit(1);
    if (!request || !['pending', 'invited'].includes((request as any).status)) {
      return res.status(404).json({ error: 'Invitation not found or already resolved' });
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, (request as any).projectId)).limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [me] = await db.select({ name: users.name, email: users.email, subscriptionTier: users.subscriptionTier }).from(users).where(eq(users.id, userId)).limit(1);
    const myName = me?.name || me?.email?.split('@')[0] || 'A user';

    if (action === 'accept') {
      const alreadyMember = await db
        .select()
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, (request as any).projectId), eq(projectMembers.userId, userId)));
      if (alreadyMember.length === 0) {
        const effectivePlan = await resolveEffectiveUserPlan(userId);
        const planTier = effectivePlan.tier;
        const currentCount = await getProjectMembershipCount(userId);
        if (currentCount >= PLAN_LIMITS[planTier]) {
          return res.status(402).json({
            error: 'RECIPIENT_LIMIT_REACHED',
            message: 'You cannot join any more projects on your current plan.',
          });
        }
        await db.insert(projectMembers).values({
          projectId: (request as any).projectId,
          userId,
          role: 'edit',
        });
      }
    }

    await db.update(projectJoinRequests)
      .set({ status: action === 'accept' ? 'accepted' : 'declined', updatedAt: new Date().toISOString() })
      .where(eq(projectJoinRequests.id, requestId));

    // Resolve the invite notification so the action buttons disappear.
    try {
      const inviteNotifs = await db
        .select()
        .from(userNotifications)
        .where(and(eq(userNotifications.userId, userId), eq(userNotifications.type, 'project_invite')));
      const ids = inviteNotifs
        .filter(n => {
          try { return JSON.parse((n as any).data || '{}').requestId === requestId; } catch { return false; }
        })
        .map(n => (n as any).id);
      for (const id of ids) {
        await db.delete(userNotifications).where(eq(userNotifications.id, id));
      }
    } catch (cleanupError) {
      console.error('Failed to clean invite notifications:', cleanupError);
    }

    // Tell the project owner what happened either way.
    try {
      await db.insert(userNotifications).values({
        userId: (project as any).ownerId,
        type: 'project_invite_response',
        title: action === 'accept' ? 'Invite accepted' : 'Invite declined',
        message: `${myName} ${action === 'accept' ? 'accepted' : 'declined'} your invitation to "${(project as any).name}".`,
        data: JSON.stringify({ projectId: (project as any).id, requestId, decision: action }),
        read: false,
      } as any);
    } catch (notifyError) {
      console.error('Failed to notify project owner:', notifyError);
    }

    res.json({ success: true, action });
  } catch (e) {
    console.error('Respond to project invite failed', e);
    res.status(500).json({ error: 'Failed to respond to invitation' });
  }
});

router.post('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await db.update(userNotifications).set({ read: true } as any).where(eq(userNotifications.userId, req.userId!));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
