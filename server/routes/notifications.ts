import { Router, Response } from 'express';
import { db } from '../db.js';
import { pendingUserChanges, userNotifications, users, userSettings } from '../../shared/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(requireAuth);

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
    const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (existing.length > 0) {
      await db.update(userSettings).set({ language: payload.language }).where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({ userId, language: payload.language });
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

router.post('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await db.update(userNotifications).set({ read: true } as any).where(eq(userNotifications.userId, req.userId!));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
