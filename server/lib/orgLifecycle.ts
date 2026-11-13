import { db } from '../db.js';
import {
  users,
  organizations,
  organizationMembers,
  taskAttachments,
  boardSnapshots,
  noteSnapshots,
  tasks,
  notes,
  boards,
  userNotifications,
} from '../../shared/schema.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { PlanTier, normalizeTier, tierRank } from './tier.js';
import { sendEmail } from './email.js';
import {
  DAY_MS,
  ARCHIVE_RETENTION_DAYS,
  ARCHIVE_WARNING_DAYS_ELAPSED,
  UNLIMITED_PAUSE_MARKER,
  computePersonalVsOrgReconciliation,
  type OrgMembershipPlanInfo,
  type PersonalVsOrgReconciliationInput,
  type PersonalVsOrgReconciliationResult,
} from './orgReconciliation.js';

export {
  DAY_MS,
  ARCHIVE_RETENTION_DAYS,
  ARCHIVE_WARNING_DAYS_ELAPSED,
  UNLIMITED_PAUSE_MARKER,
  computePersonalVsOrgReconciliation,
  type OrgMembershipPlanInfo,
  type PersonalVsOrgReconciliationInput,
  type PersonalVsOrgReconciliationResult,
};

export interface EffectiveUserPlan {
  tier: PlanTier;
  status: 'active' | 'inactive' | 'paused' | 'trialing';
  source: 'personal' | 'organization' | 'free';
  personalTier: PlanTier;
  personalStatus: string;
  personalPlanPaused: boolean;
  pausedPersonalTier: PlanTier | null;
  pausedPersonalRemainingMs: number | null;
  bestOrgTier: PlanTier;
  bestOrgId: number | null;
  bestOrgName: string | null;
  reservedOrgTier: PlanTier | null;
  archivedAttachmentCount: number;
  oldestArchiveExpiresAt: string | null;
}

function resolveAttachmentDiskPath(fileUrl: string): string {
  const base = process.env.VERCEL === '1' ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads');
  return path.join(base, path.basename(fileUrl));
}

function removeAttachmentDiskFile(fileUrl: string): void {
  if (!fileUrl) return;
  try {
    const filePath = resolveAttachmentDiskPath(fileUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch { /* disk cleanup best-effort */ }
}

/**
 * Collects all existing task and note IDs owned by the user across snapshots and relational tables
 * so archived attachments are restored only if their parent task or note still exists (Rule 10/11).
 */
export async function getUserActiveParentIds(userId: number): Promise<Set<string>> {
  const ids = new Set<string>();

  const [boardSnapRows, noteSnapRows, userBoardsRows, userNotesRows] = await Promise.all([
    db.select({ snapshot: boardSnapshots.snapshot }).from(boardSnapshots).where(eq(boardSnapshots.userId, userId)).orderBy(desc(boardSnapshots.updatedAt)).limit(1),
    db.select({ snapshot: noteSnapshots.snapshot }).from(noteSnapshots).where(eq(noteSnapshots.userId, userId)).orderBy(desc(noteSnapshots.updatedAt)).limit(1),
    db.select({ id: boards.id }).from(boards).where(eq(boards.userId, userId)),
    db.select({ id: notes.id }).from(notes).where(eq(notes.userId, userId)),
  ]);

  if (boardSnapRows[0]?.snapshot) {
    try {
      const parsed = JSON.parse(boardSnapRows[0].snapshot);
      if (Array.isArray(parsed?.tasks)) {
        for (const t of parsed.tasks) {
          if (t?.id != null) ids.add(String(t.id));
        }
      }
    } catch { /* malformed snapshot */ }
  }

  if (noteSnapRows[0]?.snapshot) {
    try {
      const parsed = JSON.parse(noteSnapRows[0].snapshot);
      const list = Array.isArray(parsed?.tasks) ? parsed.tasks : Array.isArray(parsed?.notes) ? parsed.notes : [];
      for (const n of list) {
        if (n?.id != null) ids.add(String(n.id));
      }
    } catch { /* malformed snapshot */ }
  }

  if (userBoardsRows.length > 0) {
    const boardIds = userBoardsRows.map((b) => b.id);
    const taskRows = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.boardId, boardIds));
    for (const t of taskRows) ids.add(String(t.id));
  }

  for (const n of userNotesRows) {
    ids.add(String(n.id));
  }

  return ids;
}

/**
 * Stamps or clears `mediaArchivedAt` on snapshot tasks/notes when a user drops to Free or regains >= Premium.
 * Keeps tasks and notes intact (Rule 10) while locking/expiring inline media at 30 days (Rule 11).
 */
async function syncSnapshotMediaArchiveState(
  userId: number,
  effectiveTier: PlanTier,
  nowIso: string,
  nowMs: number
): Promise<void> {
  const isFree = effectiveTier === 'free';
  const retentionCutoff = nowMs - ARCHIVE_RETENTION_DAYS * DAY_MS;

  const updateSnapshotList = (list: any[]): { changed: boolean; next: any[] } => {
    let changed = false;
    const next = list.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const hasMedia =
        (Array.isArray(item.images) && item.images.length > 0) ||
        (Array.isArray(item.attachments) && item.attachments.length > 0);
      if (!hasMedia) {
        if (item.mediaArchivedAt) {
          changed = true;
          const copy = { ...item };
          delete copy.mediaArchivedAt;
          return copy;
        }
        return item;
      }

      if (isFree) {
        if (!item.mediaArchivedAt) {
          changed = true;
          return { ...item, mediaArchivedAt: nowIso };
        }
        const archivedMs = new Date(item.mediaArchivedAt).getTime();
        if (Number.isFinite(archivedMs) && archivedMs <= retentionCutoff) {
          changed = true;
          const copy = { ...item, images: [], attachments: [] };
          delete copy.mediaArchivedAt;
          return copy;
        }
        return item;
      }

      // Paid tier: restore within 30d, strip if expired > 30d
      if (item.mediaArchivedAt) {
        changed = true;
        const archivedMs = new Date(item.mediaArchivedAt).getTime();
        const copy = { ...item };
        delete copy.mediaArchivedAt;
        if (Number.isFinite(archivedMs) && archivedMs <= retentionCutoff) {
          copy.images = [];
          copy.attachments = [];
        }
        return copy;
      }
      return item;
    });
    return { changed, next };
  };

  try {
    const [bSnap] = await db
      .select()
      .from(boardSnapshots)
      .where(eq(boardSnapshots.userId, userId))
      .orderBy(desc(boardSnapshots.updatedAt))
      .limit(1);
    if (bSnap?.snapshot) {
      const parsed = JSON.parse(bSnap.snapshot);
      if (Array.isArray(parsed?.tasks)) {
        const { changed, next } = updateSnapshotList(parsed.tasks);
        if (changed) {
          parsed.tasks = next;
          await db
            .update(boardSnapshots)
            .set({ snapshot: JSON.stringify(parsed) })
            .where(eq(boardSnapshots.id, bSnap.id));
        }
      }
    }
  } catch { /* non-fatal snapshot sync */ }

  try {
    const [nSnap] = await db
      .select()
      .from(noteSnapshots)
      .where(eq(noteSnapshots.userId, userId))
      .orderBy(desc(noteSnapshots.updatedAt))
      .limit(1);
    if (nSnap?.snapshot) {
      const parsed = JSON.parse(nSnap.snapshot);
      const key = Array.isArray(parsed?.tasks) ? 'tasks' : Array.isArray(parsed?.notes) ? 'notes' : null;
      if (key) {
        const { changed, next } = updateSnapshotList(parsed[key]);
        if (changed) {
          parsed[key] = next;
          await db
            .update(noteSnapshots)
            .set({ snapshot: JSON.stringify(parsed) })
            .where(eq(noteSnapshots.id, nSnap.id));
        }
      }
    }
  } catch { /* non-fatal note snapshot sync */ }
}

/**
 * Reconciles a user's personal plan vs organization memberships AND archives/restores
 * Premium content (`taskAttachments` and snapshot media) when dropping to or leaving Free.
 */
export async function reconcileUserOrgState(userId: number, syncSnapshots = true): Promise<EffectiveUserPlan> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const [userRow] = await db
    .select({
      id: users.id,
      subscriptionTier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionEndsAt: users.subscriptionEndsAt,
      pausedPersonalTier: users.pausedPersonalTier,
      pausedPersonalStatus: users.pausedPersonalStatus,
      pausedPersonalRemainingMs: users.pausedPersonalRemainingMs,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) {
    return {
      tier: 'free',
      status: 'inactive',
      source: 'free',
      personalTier: 'free',
      personalStatus: 'inactive',
      personalPlanPaused: false,
      pausedPersonalTier: null,
      pausedPersonalRemainingMs: null,
      bestOrgTier: 'free',
      bestOrgId: null,
      bestOrgName: null,
      reservedOrgTier: null,
      archivedAttachmentCount: 0,
      oldestArchiveExpiresAt: null,
    };
  }

  const memberships = await db
    .select({
      orgId: organizations.id,
      orgName: organizations.name,
      tier: organizations.tier,
      status: organizations.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId));

  const rec = computePersonalVsOrgReconciliation({
    ownTier: userRow.subscriptionTier,
    ownStatus: userRow.subscriptionStatus,
    ownEndsAt: userRow.subscriptionEndsAt,
    pausedTier: userRow.pausedPersonalTier,
    pausedStatus: userRow.pausedPersonalStatus,
    pausedRemainingMs: userRow.pausedPersonalRemainingMs,
    orgMemberships: memberships,
    nowMs,
  });

  if (rec.action === 'pause_personal') {
    await db
      .update(users)
      .set({
        pausedPersonalTier: rec.personalTier,
        pausedPersonalStatus: userRow.subscriptionStatus || 'active',
        pausedPersonalRemainingMs: String(rec.newRemainingMs ?? UNLIMITED_PAUSE_MARKER),
        pausedPersonalAt: nowIso,
        subscriptionStatus: 'paused',
      })
      .where(eq(users.id, userId));
  } else if (rec.action === 'resume_personal') {
    await db
      .update(users)
      .set({
        subscriptionTier: rec.personalTier,
        subscriptionStatus: rec.personalStatus,
        subscriptionEndsAt: rec.newEndsAt ?? null,
        pausedPersonalTier: null,
        pausedPersonalStatus: null,
        pausedPersonalRemainingMs: null,
        pausedPersonalAt: null,
      })
      .where(eq(users.id, userId));
  } else if (rec.action === 'expire_personal') {
    await db
      .update(users)
      .set({
        subscriptionTier: 'free',
        subscriptionStatus: 'inactive',
        pausedPersonalTier: null,
        pausedPersonalStatus: null,
        pausedPersonalRemainingMs: null,
        pausedPersonalAt: null,
      })
      .where(eq(users.id, userId));
  }

  // Reconcile Premium attachment archival/restoration
  const userAtts = await db
    .select({
      id: taskAttachments.id,
      taskId: taskAttachments.taskId,
      fileUrl: taskAttachments.fileUrl,
      archived: taskAttachments.archived,
      archivedAt: taskAttachments.archivedAt,
    })
    .from(taskAttachments)
    .where(eq(taskAttachments.userId, userId));

  let attachmentTransition = false;
  if (rec.effectiveTier === 'free') {
    const toArchiveIds = userAtts.filter((a) => !a.archived).map((a) => a.id);
    if (toArchiveIds.length > 0) {
      attachmentTransition = true;
      await db
        .update(taskAttachments)
        .set({ archived: true, archivedAt: nowIso, archiveWarningSent: false })
        .where(inArray(taskAttachments.id, toArchiveIds));
    }
  } else {
    const archivedRows = userAtts.filter((a) => a.archived);
    if (archivedRows.length > 0) {
      attachmentTransition = true;
      const parentIds = await getUserActiveParentIds(userId);
      const restoreIds: number[] = [];
      const purgeRows: Array<{ id: number; fileUrl: string }> = [];

      for (const att of archivedRows) {
        const archivedMs = att.archivedAt ? new Date(att.archivedAt).getTime() : 0;
        const within30d = Number.isFinite(archivedMs) && archivedMs > 0 && nowMs - archivedMs <= ARCHIVE_RETENTION_DAYS * DAY_MS;
        if (within30d && parentIds.has(String(att.taskId))) {
          restoreIds.push(att.id);
        } else {
          purgeRows.push({ id: att.id, fileUrl: att.fileUrl });
        }
      }

      if (restoreIds.length > 0) {
        await db
          .update(taskAttachments)
          .set({ archived: false, archivedAt: null, archiveWarningSent: false })
          .where(inArray(taskAttachments.id, restoreIds));
      }
      if (purgeRows.length > 0) {
        for (const r of purgeRows) removeAttachmentDiskFile(r.fileUrl);
        await db
          .delete(taskAttachments)
          .where(inArray(taskAttachments.id, purgeRows.map((r) => r.id)));
      }
    }
  }

  if (syncSnapshots || rec.action !== 'none' || attachmentTransition) {
    await syncSnapshotMediaArchiveState(userId, rec.effectiveTier, nowIso, nowMs);
  }

  const remainingArchived = rec.effectiveTier === 'free'
    ? await db
        .select({ archivedAt: taskAttachments.archivedAt })
        .from(taskAttachments)
        .where(and(eq(taskAttachments.userId, userId), eq(taskAttachments.archived, true)))
    : [];

  let oldestArchiveExpiresAt: string | null = null;
  if (remainingArchived.length > 0) {
    const earliest = remainingArchived
      .map((r) => new Date(r.archivedAt || nowIso).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b)[0];
    if (earliest) {
      oldestArchiveExpiresAt = new Date(earliest + ARCHIVE_RETENTION_DAYS * DAY_MS).toISOString();
    }
  }

  return {
    tier: rec.effectiveTier,
    status: rec.effectiveStatus,
    source: rec.source,
    personalTier: rec.personalTier,
    personalStatus: rec.personalStatus,
    personalPlanPaused: rec.personalPlanPaused,
    pausedPersonalTier: rec.pausedPersonalTier,
    pausedPersonalRemainingMs: rec.pausedPersonalRemainingMs,
    bestOrgTier: rec.bestOrgTier,
    bestOrgId: rec.bestOrgId,
    bestOrgName: rec.bestOrgName,
    reservedOrgTier: rec.reservedOrgTier,
    archivedAttachmentCount: remainingArchived.length,
    oldestArchiveExpiresAt,
  };
}

/**
 * Convenience alias used across all route handlers instead of reading `users.subscriptionTier` directly.
 */
export async function resolveEffectiveUserPlan(userId: number): Promise<EffectiveUserPlan> {
  return reconcileUserOrgState(userId, false);
}

/**
 * Reconciles all members of an organization when org status, tier, or existence changes.
 */
export async function reconcileOrgMembers(orgId: number): Promise<void> {
  const members = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, orgId));

  for (const m of members) {
    try {
      await reconcileUserOrgState(m.userId);
    } catch (e) {
      console.error(`Failed to reconcile user ${m.userId} for org ${orgId}:`, e);
    }
  }
}

/**
 * Daily background lifecycle sweep:
 * 1. Expires personal paid plans whose `subscriptionEndsAt` passed and switches users to any reserved org plan or Free (archiving Premium content).
 * 2. Sends warning emails 10 days before the 30-day permanent deletion of archived files/images (at >= 20 days elapsed).
 * 3. Permanently deletes archived attachments after 30 days.
 */
export async function runArchiveLifecycleSweep(): Promise<{
  reconciledUsers: number;
  warningsSent: number;
  permanentlyDeleted: number;
}> {
  const nowMs = Date.now();
  const deleteCutoff = nowMs - ARCHIVE_RETENTION_DAYS * DAY_MS;
  const warnCutoff = nowMs - ARCHIVE_WARNING_DAYS_ELAPSED * DAY_MS;

  let reconciledUsers = 0;
  let warningsSent = 0;
  let permanentlyDeleted = 0;

  try {
    // Reconcile users with timed subscriptions that may have expired
    const timedUsers = await db
      .select({ id: users.id, subscriptionEndsAt: users.subscriptionEndsAt, subscriptionStatus: users.subscriptionStatus })
      .from(users);

    for (const u of timedUsers) {
      if (
        u.subscriptionEndsAt &&
        ['active', 'trialing'].includes(String(u.subscriptionStatus || '').toLowerCase()) &&
        new Date(u.subscriptionEndsAt).getTime() <= nowMs
      ) {
        await reconcileUserOrgState(u.id);
        reconciledUsers++;
      }
    }

    const archived = await db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.archived, true));

    const toWarnByUser = new Map<number, typeof archived>();
    const toDelete: typeof archived = [];

    for (const att of archived) {
      const archivedMs = att.archivedAt ? new Date(att.archivedAt).getTime() : 0;
      if (!Number.isFinite(archivedMs) || archivedMs <= 0) continue;
      if (archivedMs <= deleteCutoff) {
        toDelete.push(att);
      } else if (archivedMs <= warnCutoff && !att.archiveWarningSent && att.userId) {
        const list = toWarnByUser.get(att.userId) || [];
        list.push(att);
        toWarnByUser.set(att.userId, list);
      }
    }

    if (toDelete.length > 0) {
      for (const att of toDelete) {
        removeAttachmentDiskFile(att.fileUrl);
      }
      await db.delete(taskAttachments).where(inArray(taskAttachments.id, toDelete.map((a) => a.id)));
      permanentlyDeleted = toDelete.length;

      // Also clean any >30d expired snapshot media for those users
      const userIds = [...new Set(toDelete.map((a) => a.userId).filter((id): id is number => typeof id === 'number'))];
      for (const uid of userIds) {
        await reconcileUserOrgState(uid);
      }
    }

    for (const [uid, items] of toWarnByUser.entries()) {
      const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, uid))
        .limit(1);
      if (!user) continue;

      const earliestMs = Math.min(...items.map((i) => new Date(i.archivedAt!).getTime()));
      const deleteDate = new Date(earliestMs + ARCHIVE_RETENTION_DAYS * DAY_MS).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      const appUrl = (process.env.FRONTEND_URL || 'https://myplanner.app').replace(/\/$/, '');
      const subject = 'Action needed: Archived files will be permanently deleted in 10 days';
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
          <h2 style="margin: 0 0 12px; font-size: 20px;">Your archived files will be deleted in 10 days</h2>
          <p style="margin: 0 0 12px; line-height: 1.6;">Hi ${user.name || 'there'},</p>
          <p style="margin: 0 0 12px; line-height: 1.6;">
            You currently have <strong>${items.length}</strong> archived attachment${items.length === 1 ? '' : 's'} (files or images) stored from before your plan changed to Free.
          </p>
          <p style="margin: 0 0 16px; line-height: 1.6;">
            They are scheduled for permanent deletion on <strong>${deleteDate}</strong> (10 days from now). If you upgrade to Premium/Pro or join an organization before then, any files whose parent task or note still exists will be restored automatically.
          </p>
          <a href="${appUrl}/pricing" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Restore Premium Access
          </a>
        </div>
      `;

      const sent = await sendEmail({ to: user.email, subject, html });
      await db.insert(userNotifications).values({
        userId: uid,
        type: 'archive_warning',
        title: 'Archived files expiring in 10 days',
        message: `${items.length} archived file${items.length === 1 ? '' : 's'} will be permanently deleted on ${deleteDate}. Upgrade or rejoin an organization to restore them.`,
        data: JSON.stringify({ count: items.length, deleteDate }),
        read: false,
      }).catch(() => {});

      // Mark warning sent even if email transport is disabled in dev so cron stays idempotent;
      // still only increment warningsSent count when email succeeded.
      await db
        .update(taskAttachments)
        .set({ archiveWarningSent: true })
        .where(inArray(taskAttachments.id, items.map((i) => i.id)));

      if (sent) warningsSent++;
    }
  } catch (err) {
    console.error('[archive-lifecycle] sweep failed:', err);
  }

  return { reconciledUsers, warningsSent, permanentlyDeleted };
}
