import { Router, Response } from 'express';
import { db } from '../db.js';
import {
  users,
  organizations,
  organizationMembers,
  organizationGroupAdmins,
  organizationMemberNotes,
} from '../../shared/schema.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getOrgAccess, isUserInManagedGroups, parseOrgSettings, DEFAULT_ORG_ADMIN_SETTINGS } from '../lib/orgAccess.js';

/**
 * Extra organization management endpoints: org admin settings, per-group admins,
 * and private admin notes about members. Mounted under /api/organizations.
 */
const router = Router();

// GET /api/organizations/:id/admin-settings
router.get('/:id/admin-settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const access = await getOrgAccess(parseInt(req.params.id), req.userId!);
    if (!access || !access.isMember) return res.status(403).json({ error: 'Not a member of this organization' });
    res.json({ settings: access.settings });
  } catch (error) {
    console.error('Get org admin settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/organizations/:id/admin-settings  (owner/admins)
router.put('/:id/admin-settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const access = await getOrgAccess(parseInt(req.params.id), req.userId!);
    if (!access) return res.status(404).json({ error: 'Organization not found' });
    if (!access.isAdmin) return res.status(403).json({ error: 'Only organization admins can change admin settings' });

    const incoming = req.body?.settings || req.body || {};
    const next = { ...access.settings };
    (Object.keys(DEFAULT_ORG_ADMIN_SETTINGS) as Array<keyof typeof DEFAULT_ORG_ADMIN_SETTINGS>).forEach(key => {
      if (typeof incoming[key] === 'boolean') next[key] = incoming[key];
    });

    let existing: Record<string, unknown> = {};
    try { existing = JSON.parse((access.org as any).settings || '{}'); } catch { existing = {}; }

    await db
      .update(organizations)
      .set({ settings: JSON.stringify({ ...existing, ...next }), updatedAt: new Date().toISOString() } as any)
      .where(eq(organizations.id, access.org.id));

    res.json({ settings: parseOrgSettings(next) });
  } catch (error) {
    console.error('Update org admin settings error:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// PUT /api/organizations/:id/groups/:groupId/admins  { userIds: number[] }
router.put('/:id/groups/:groupId/admins', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const groupId = parseInt(req.params.groupId);
    const access = await getOrgAccess(orgId, req.userId!);
    if (!access) return res.status(404).json({ error: 'Organization not found' });

    const group = access.groups.find(g => g.id === groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!access.canSetGroupAdmins(groupId)) {
      return res.status(403).json({
        error: group.parentId == null
          ? 'Only organization admins can choose group admins'
          : 'You do not have permission to choose admins for this sub-group',
      });
    }

    const requested: number[] = Array.isArray(req.body?.userIds)
      ? Array.from(new Set<number>(req.body.userIds.map((v: unknown) => parseInt(String(v))).filter((n: number) => Number.isFinite(n))))
      : [];

    let validIds: number[] = [];
    if (requested.length > 0) {
      const memberRows = await db
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, orgId), inArray(organizationMembers.userId, requested)));
      validIds = memberRows.map(r => r.userId);
    }

    await db.delete(organizationGroupAdmins).where(eq(organizationGroupAdmins.groupId, groupId));
    if (validIds.length > 0) {
      await db.insert(organizationGroupAdmins).values(
        validIds.map(uid => ({ organizationId: orgId, groupId, userId: uid })),
      );
    }

    res.json({ groupId, adminIds: validIds, message: 'Group admins updated' });
  } catch (error) {
    console.error('Update group admins error:', error);
    res.status(500).json({ error: 'Failed to update group admins' });
  }
});

async function requireNotesAccess(req: AuthRequest, res: Response, targetUserId: number) {
  const access = await getOrgAccess(parseInt(req.params.id), req.userId!);
  if (!access) {
    res.status(404).json({ error: 'Organization not found' });
    return null;
  }
  if (access.isAdmin) return access;
  if (access.isGroupAdmin && access.settings.groupAdminsCanUseNotes && await isUserInManagedGroups(access, targetUserId)) {
    return access;
  }
  res.status(403).json({ error: 'You do not have access to notes for this member' });
  return null;
}

// GET /api/organizations/:id/members/:userId/notes
router.get('/:id/members/:userId/notes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const access = await requireNotesAccess(req, res, targetUserId);
    if (!access) return;

    const rows = await db
      .select({
        id: organizationMemberNotes.id,
        content: organizationMemberNotes.content,
        authorId: organizationMemberNotes.authorId,
        authorName: users.name,
        authorEmail: users.email,
        createdAt: organizationMemberNotes.createdAt,
        updatedAt: organizationMemberNotes.updatedAt,
      })
      .from(organizationMemberNotes)
      .innerJoin(users, eq(users.id, organizationMemberNotes.authorId))
      .where(and(eq(organizationMemberNotes.organizationId, access.org.id), eq(organizationMemberNotes.targetUserId, targetUserId)))
      .orderBy(desc(organizationMemberNotes.createdAt));

    res.json({
      notes: rows.map(r => ({
        ...r,
        authorName: r.authorName || r.authorEmail.split('@')[0],
        authorEmail: undefined,
        canEdit:
          r.authorId === req.userId ||
          access.isOwner ||
          access.isAdmin ||
          (access.isGroupAdmin && access.settings.groupAdminsCanEditAnyNote),
      })),
    });
  } catch (error) {
    console.error('Get member notes error:', error);
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

// POST /api/organizations/:id/members/:userId/notes  { content }
router.post('/:id/members/:userId/notes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Note cannot be empty' });
    if (content.length > 5000) return res.status(400).json({ error: 'Note is too long (5000 characters max)' });

    const access = await requireNotesAccess(req, res, targetUserId);
    if (!access) return;

    const [target] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, access.org.id), eq(organizationMembers.userId, targetUserId)))
      .limit(1);
    if (!target) return res.status(404).json({ error: 'Member not found in this organization' });

    const [note] = await db
      .insert(organizationMemberNotes)
      .values({ organizationId: access.org.id, targetUserId, authorId: req.userId!, content })
      .returning();
    res.json({ note });
  } catch (error) {
    console.error('Create member note error:', error);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

async function loadOwnNote(req: AuthRequest, res: Response) {
  const noteId = parseInt(req.params.noteId);
  const access = await getOrgAccess(parseInt(req.params.id), req.userId!);
  if (!access) {
    res.status(404).json({ error: 'Organization not found' });
    return null;
  }
  const [note] = await db
    .select()
    .from(organizationMemberNotes)
    .where(and(eq(organizationMemberNotes.id, noteId), eq(organizationMemberNotes.organizationId, access.org.id)))
    .limit(1);
  if (!note) {
    res.status(404).json({ error: 'Note not found' });
    return null;
  }
  const canGroupAdminEdit =
    note.authorId !== req.userId &&
    !access.isOwner &&
    !access.isAdmin &&
    access.isGroupAdmin &&
    access.settings.groupAdminsCanUseNotes &&
    access.settings.groupAdminsCanEditAnyNote &&
    (await isUserInManagedGroups(access, note.targetUserId));
  if (note.authorId !== req.userId && !access.isOwner && !access.isAdmin && !canGroupAdminEdit) {
    res.status(403).json({ error: 'Only the author or an administrator can change this note' });
    return null;
  }
  return note;
}

// PUT /api/organizations/:id/member-notes/:noteId  { content }
router.put('/:id/member-notes/:noteId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Note cannot be empty' });
    const note = await loadOwnNote(req, res);
    if (!note) return;
    const [updated] = await db
      .update(organizationMemberNotes)
      .set({ content: content.slice(0, 5000), updatedAt: new Date().toISOString() })
      .where(eq(organizationMemberNotes.id, note.id))
      .returning();
    res.json({ note: updated });
  } catch (error) {
    console.error('Update member note error:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// DELETE /api/organizations/:id/member-notes/:noteId
router.delete('/:id/member-notes/:noteId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const note = await loadOwnNote(req, res);
    if (!note) return;
    await db.delete(organizationMemberNotes).where(eq(organizationMemberNotes.id, note.id));
    res.json({ message: 'Note deleted' });
  } catch (error) {
    console.error('Delete member note error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

export default router;
