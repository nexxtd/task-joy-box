import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import {
  users,
  organizations,
  organizationMembers,
  organizationGroups,
  organizationGroupMembers,
  organizationGroupAdmins,
} from '../../shared/schema.js';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { getOrgAccess, isUserInManagedGroups, parseOrgSettings } from '../lib/orgAccess.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { reconcileUserOrgState, reconcileOrgMembers } from '../lib/orgLifecycle.js';

async function countOrganizationMembers(orgId: number): Promise<number> {
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, orgId));
  return Number(cnt || 0);
}

async function syncOrganizationSeats(orgId: number): Promise<number> {
  const actualCount = Math.max(1, await countOrganizationMembers(orgId));
  await db
    .update(organizations)
    .set({ currentSeats: actualCount, updatedAt: new Date().toISOString() })
    .where(eq(organizations.id, orgId));
  return actualCount;
}

const router = Router();

// Rate limiter for code-based joins to prevent brute forcing
const joinAttempts = new Map<string, { count: number; resetAt: number }>();
function checkJoinRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = joinAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    joinAttempts.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count += 1;
  return true;
}

/** Replace the admins of a group/sub-group with the given org members. Returns the ids saved. */
async function setGroupAdmins(orgId: number, groupId: number, rawIds: unknown[]): Promise<number[]> {
  const requested = Array.from(new Set(rawIds.map(v => parseInt(String(v))).filter(n => Number.isFinite(n))));
  let valid: number[] = [];
  if (requested.length > 0) {
    const rows = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), inArray(organizationMembers.userId, requested)));
    valid = rows.map(r => r.userId);
  }
  await db.delete(organizationGroupAdmins).where(eq(organizationGroupAdmins.groupId, groupId));
  if (valid.length > 0) {
    await db.insert(organizationGroupAdmins).values(valid.map(uid => ({ organizationId: orgId, groupId, userId: uid })));
  }
  return valid;
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET /api/organizations - List user's owned, administered, and joined organizations
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Find all memberships
    const memberships = await db
      .select({
        membershipId: organizationMembers.id,
        role: organizationMembers.role,
        joinedAt: organizationMembers.createdAt,
        orgId: organizations.id,
        name: organizations.name,
        type: organizations.type,
        ownerId: organizations.ownerId,
        maxSeats: organizations.maxSeats,
        currentSeats: organizations.currentSeats,
        tier: organizations.tier,
        status: organizations.status,
        joinCode: organizations.joinCode,
        createdAt: organizations.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId));

    const ownedOrAdmin: any[] = [];
    const joined: any[] = [];
    const groupAdminRows = memberships.length
      ? await db.select().from(organizationGroupAdmins).where(eq(organizationGroupAdmins.userId, userId))
      : [];
    const settingsRows = memberships.length
      ? await db.select({ id: organizations.id, settings: organizations.settings }).from(organizations)
          .where(inArray(organizations.id, memberships.map(m => m.orgId)))
      : [];

    for (const m of memberships) {
      const isOwner = m.ownerId === userId;
      const isAdmin = m.role === 'admin' || isOwner;
      const orgSettings = parseOrgSettings(settingsRows.find(r => r.id === m.orgId)?.settings);
      const isGroupAdmin = !isAdmin && orgSettings.groupAdminsEnabled && groupAdminRows.some(r => r.organizationId === m.orgId);

      const orgItem = {
        id: m.orgId,
        name: m.name,
        type: m.type,
        ownerId: m.ownerId,
        maxSeats: m.maxSeats,
        currentSeats: m.currentSeats,
        tier: m.tier,
        status: m.status,
        ...(isAdmin ? { joinCode: m.joinCode } : {}),
        role: isOwner ? 'owner' : m.role,
        isOwner,
        isAdmin,
        isGroupAdmin,
        createdAt: m.createdAt,
        joinedAt: m.joinedAt,
      };

      if (isOwner || isAdmin || isGroupAdmin) {
        ownedOrAdmin.push(orgItem);
      }
      if (!isOwner) {
        joined.push(orgItem);
      }
    }

    res.json({
      organizations: ownedOrAdmin,
      joinedOrganizations: joined,
      primaryOrganization: ownedOrAdmin[0] || joined[0] || null,
    });
  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

// GET /api/organizations/:id - Get full organization details
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = req.userId!;

    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // Verify user is a member of this organization
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    if (membership.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const isOwner = org.ownerId === userId;
    const isAdmin = membership[0].role === 'admin' || isOwner;
    const access = await getOrgAccess(orgId, userId);
    const isGroupAdmin = Boolean(access?.isGroupAdmin);
    if (!isAdmin && !isGroupAdmin) {
      return res.status(403).json({ error: 'Only organization owners and administrators can view organization management details' });
    }
    const managedGroupIds = access ? Array.from(access.managedGroupIds) : [];
    const userRole = isOwner ? 'owner' : (isAdmin ? membership[0].role : 'group_admin');
    const groupAdminRows = await db
      .select()
      .from(organizationGroupAdmins)
      .where(eq(organizationGroupAdmins.organizationId, orgId));
    const adminIdsByGroup = new Map<number, number[]>();
    groupAdminRows.forEach(r => {
      const list = adminIdsByGroup.get(r.groupId) || [];
      if (!list.includes(r.userId)) list.push(r.userId);
      adminIdsByGroup.set(r.groupId, list);
    });

    // Get all members
    const membersData = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        lastActiveAt: users.lastActiveAt,
        role: organizationMembers.role,
        joinedAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, orgId));

    // Get all groups and sub-groups
    const groupsData = await db
      .select()
      .from(organizationGroups)
      .where(eq(organizationGroups.organizationId, orgId))
      .orderBy(organizationGroups.sortOrder, organizationGroups.name);

    // Get all group member assignments
    const groupMembersData = await db
      .select()
      .from(organizationGroupMembers)
      .where(eq(organizationGroupMembers.organizationId, orgId));

    // Map member assignments: userId -> list of { groupId, subGroupId }
    const userAssignments = new Map<number, Array<{ groupId: number; subGroupId: number | null }>>();
    groupMembersData.forEach(gm => {
      const list = userAssignments.get(gm.userId) || [];
      list.push({ groupId: gm.groupId, subGroupId: gm.subGroupId });
      userAssignments.set(gm.userId, list);
    });

    // Structure groups with sub-groups and member counts
    const mainGroups = groupsData.filter(g => !g.parentId);
    const subGroups = groupsData.filter(g => g.parentId != null);

    const groupMap = new Map<number, any>();
    mainGroups.forEach(g => {
      groupMap.set(g.id, {
        ...g,
        subGroups: [],
        directMemberIds: [] as number[],
        allMemberIds: new Set<number>(),
      });
    });

    subGroups.forEach(sg => {
      const parent = groupMap.get(sg.parentId!);
      const sgObj = {
        ...sg,
        memberIds: [] as number[],
      };
      if (parent) {
        parent.subGroups.push(sgObj);
      }
    });

    // Populate assignments
    groupMembersData.forEach(gm => {
      const parent = groupMap.get(gm.groupId);
      if (parent) {
        parent.allMemberIds.add(gm.userId);
        if (gm.subGroupId) {
          const sub = parent.subGroups.find((s: any) => s.id === gm.subGroupId);
          if (sub && !sub.memberIds.includes(gm.userId)) {
            sub.memberIds.push(gm.userId);
          }
        } else {
          if (!parent.directMemberIds.includes(gm.userId)) {
            parent.directMemberIds.push(gm.userId);
          }
        }
      }
    });

    // Transform groups back to array with member lists
    const allFormattedGroups = mainGroups.map(g => {
      const mapped = groupMap.get(g.id);
      return {
        ...g,
        memberCount: mapped.allMemberIds.size,
        directMemberCount: mapped.directMemberIds.length,
        directMemberIds: mapped.directMemberIds,
        adminIds: adminIdsByGroup.get(g.id) || [],
        subGroups: mapped.subGroups.map((sg: any) => ({
          ...sg,
          memberCount: sg.memberIds.length,
          memberIds: sg.memberIds,
          adminIds: adminIdsByGroup.get(sg.id) || [],
        })),
      };
    });

    // Group admins only see the groups (and sub-groups) they manage, and the people in them.
    const managedSet = new Set(managedGroupIds);
    const formattedGroups = isAdmin
      ? allFormattedGroups
      : allFormattedGroups
          .filter(g => managedSet.has(g.id) || g.subGroups.some((sg: any) => managedSet.has(sg.id)))
          .map(g => managedSet.has(g.id) ? g : { ...g, subGroups: g.subGroups.filter((sg: any) => managedSet.has(sg.id)) });
    const visibleUserIds = new Set<number>();
    if (!isAdmin) {
      groupMembersData.forEach(gm => {
        if (managedSet.has(gm.groupId) || (gm.subGroupId != null && managedSet.has(gm.subGroupId))) visibleUserIds.add(gm.userId);
      });
      visibleUserIds.add(userId);
    }

    // Unassigned members: members not in any group
    const assignedUserIds = new Set(groupMembersData.map(gm => gm.userId));
    const unassignedMembers = membersData.filter(m => !assignedUserIds.has(m.id));
    const orgSettings = parseOrgSettings((org as any).settings);
    const canSeeAllMembers = isAdmin || orgSettings.groupAdminsCanViewAllMembers;
    const canSeeUnassigned = isAdmin || orgSettings.groupAdminsCanMoveMembers || orgSettings.groupAdminsCanViewAllMembers;

    // Map each member's groups for the users table
    const visibleMembersData = canSeeAllMembers
      ? membersData
      : membersData.filter(m => visibleUserIds.has(m.id) || (orgSettings.groupAdminsCanMoveMembers && !assignedUserIds.has(m.id)));
    const members = visibleMembersData.map(m => {
      const assignments = userAssignments.get(m.id) || [];
      const assignedGroupNames: string[] = [];
      const assignedSubGroupNames: string[] = [];

      assignments.forEach(a => {
        const parent = groupsData.find(g => g.id === a.groupId);
        if (parent && !assignedGroupNames.includes(parent.name)) {
          assignedGroupNames.push(parent.name);
        }
        if (a.subGroupId) {
          const sub = groupsData.find(g => g.id === a.subGroupId);
          if (sub && !assignedSubGroupNames.includes(sub.name)) {
            assignedSubGroupNames.push(sub.name);
          }
        }
      });

      return {
        id: m.id,
        name: m.name || m.email.split('@')[0],
        email: isAdmin || orgSettings.showMemberEmailsToGroupAdmins ? m.email : 'Hidden by org policy',
        role: m.id === org.ownerId ? 'owner' : m.role,
        joinedAt: m.joinedAt,
        lastActiveAt: orgSettings.showMemberLastActive || isAdmin ? m.lastActiveAt || null : null,
        groups: assignedGroupNames,
        subGroups: assignedSubGroupNames,
        isOwner: m.id === org.ownerId,
        isAdmin: m.role === 'admin' || m.id === org.ownerId,
        assignments,
        adminOfGroupIds: groupAdminRows.filter(r => r.userId === m.id).map(r => r.groupId),
      };
    });

    res.json({
      organization: {
        id: org.id,
        name: org.name,
        type: org.type,
        ownerId: org.ownerId,
        maxSeats: org.maxSeats,
        currentSeats: org.currentSeats,
        tier: org.tier,
        status: org.status,
        joinCode: isAdmin ? org.joinCode : undefined,
        createdAt: org.createdAt,
      },
      userRole,
      isOwner,
      isAdmin,
      isGroupAdmin,
      managedGroupIds,
      adminGroupIds: access ? Array.from(access.adminGroupIds) : [],
      settings: orgSettings,
      members,
      groups: formattedGroups,
      unassignedMembers: (canSeeUnassigned ? unassignedMembers : []).map(m => ({
        id: m.id,
        name: m.name || m.email.split('@')[0],
        email: isAdmin || orgSettings.showMemberEmailsToGroupAdmins ? m.email : 'Hidden by org policy',
        role: m.id === org.ownerId ? 'owner' : m.role,
        joinedAt: m.joinedAt,
      })),
    });
  } catch (error) {
    console.error('Get organization detail error:', error);
    res.status(500).json({ error: 'Failed to get organization details' });
  }
});

// POST /api/organizations - Create a new organization
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, maxSeats, tier } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Organization name must be at least 2 characters' });
    }

    const orgType = type === 'family' ? 'family' : type === 'school' ? 'school' : 'business';
    const parsedSeats = orgType === 'family' ? 5 : Math.max(1, parseInt(maxSeats) || 10);
    const orgTier = tier === 'premium' ? 'premium' : 'pro';
    const rootCode = generateJoinCode();

    // Insert organization
    const [newOrg] = await db
      .insert(organizations)
      .values({
        name: name.trim(),
        type: orgType,
        ownerId: req.userId!,
        maxSeats: parsedSeats,
        currentSeats: 1, // Owner occupies 1 seat
        tier: orgTier,
        status: 'active',
        joinCode: rootCode,
      })
      .returning();

    // Add owner to members table
    await db.insert(organizationMembers).values({
      organizationId: newOrg.id,
      userId: req.userId!,
      role: 'owner',
    });

    res.json({
      organization: newOrg,
      message: 'Organization created successfully',
    });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// PUT /api/organizations/:id - Update organization settings
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = req.userId!;
    const { name, maxSeats, tier, regenerateCode } = req.body;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Check membership
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    const isOwner = org.ownerId === userId;
    const isAdmin = membership?.role === 'admin' || isOwner;
    const hasOwnerOnlyChanges = name !== undefined || maxSeats !== undefined || tier !== undefined;

    if (hasOwnerOnlyChanges && !isOwner) {
      return res.status(403).json({ error: 'Only the organization owner can update organization settings' });
    }
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    const updates: any = { updatedAt: new Date().toISOString() };

    if (name && name.trim().length >= 2) {
      updates.name = name.trim();
    }

    // Seat capacity and plan tier are billed. They can only change through the paid
    // org checkout (/api/payment/create-org-checkout-session), never for free here.
    if (maxSeats !== undefined) {
      const requestedSeats = parseInt(String(maxSeats), 10);
      if (!Number.isFinite(requestedSeats) || requestedSeats < 1) {
        return res.status(400).json({ error: 'maxSeats must be at least 1' });
      }
      if (requestedSeats !== org.maxSeats) {
        const liveMemberCount = await countOrganizationMembers(orgId);
        if (requestedSeats < liveMemberCount) {
          return res.status(400).json({
            error: `Cannot reduce seat capacity below current member count (${liveMemberCount})`,
          });
        }
        return res.status(402).json({
          error: 'Changing seat capacity requires checkout. Use "Pay & apply" in Billing.',
          requiresCheckout: true,
        });
      }
    }
    if (tier !== undefined && tier !== org.tier) {
      return res.status(402).json({
        error: 'Changing plan tier requires checkout. Use "Pay & apply" in Billing.',
        requiresCheckout: true,
      });
    }
    if (regenerateCode === true) {
      updates.joinCode = generateJoinCode();
    }

    const [updated] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId))
      .returning();

    res.json({ organization: updated, message: 'Organization updated' });
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// DELETE /api/organizations/:id - Delete organization (owner only)
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = req.userId!;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the organization owner can delete the organization' });
    }

    const memberRows = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));

    await db.delete(organizationGroupMembers).where(eq(organizationGroupMembers.organizationId, orgId));
    await db.delete(organizationGroups).where(eq(organizationGroups.organizationId, orgId));
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));

    for (const m of memberRows) {
      await reconcileUserOrgState(m.userId);
    }

    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// POST /api/organizations/:id/groups - Create a group or sub-group
router.post('/:id/groups', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = req.userId!;
    const { name, color, icon, parentId, codeExpiresAt, codeMaxUses, adminIds } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.type === 'family') {
      return res.status(403).json({ error: 'Family plans do not use groups or sub-groups.' });
    }

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    const isOwner = org.ownerId === userId;
    const isAdmin = membership?.role === 'admin' || isOwner;
    const access = await getOrgAccess(orgId, userId);
    const parsedParentId = parentId ? parseInt(parentId) : null;
    const groupAdminMayCreate = Boolean(
      access &&
        parsedParentId != null &&
        access.settings.groupAdminsCanCreateSubgroups &&
        access.adminGroupIds.has(parsedParentId)
    );
    if (!isAdmin && !groupAdminMayCreate) {
      return res.status(403).json({ error: parsedParentId ? 'You cannot add sub-groups to this group' : 'Only administrators can create groups' });
    }
    if (parsedParentId != null && !access?.groups.some(g => g.id === parsedParentId && g.parentId == null)) {
      return res.status(400).json({ error: 'Parent group not found in this organization' });
    }

    const joinCode = generateJoinCode();

    const [newGroup] = await db
      .insert(organizationGroups)
      .values({
        organizationId: orgId,
        parentId: parsedParentId,
        name: name.trim(),
        color: color || '#3b82f6',
        icon: icon || 'Folder',
        joinCode,
        codeExpiresAt: codeExpiresAt || null,
        codeMaxUses: codeMaxUses ? parseInt(codeMaxUses) : null,
        codeUses: 0,
        codeActive: true,
      })
      .returning();

    // Optional group admins chosen in the create dialog.
    const mayAssignAdmins = isAdmin || Boolean(
      access && parsedParentId != null && access.adminGroupIds.has(parsedParentId) && access.settings.groupAdminsCanManageSubgroupAdmins
    );
    let assignedAdminIds: number[] = [];
    if (mayAssignAdmins && Array.isArray(adminIds) && adminIds.length > 0) {
      assignedAdminIds = await setGroupAdmins(orgId, newGroup.id, adminIds);
    }

    res.json({ group: { ...newGroup, adminIds: assignedAdminIds }, message: 'Group created successfully' });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// PUT /api/organizations/:id/groups/:groupId - Edit group/sub-group
router.put('/:id/groups/:groupId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const groupId = parseInt(req.params.groupId);
    const userId = req.userId!;
    const { name, color, icon, regenerateCode, codeActive, codeExpiresAt, codeMaxUses, adminIds } = req.body;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    const isOwner = org.ownerId === userId;
    const isAdmin = membership?.role === 'admin' || isOwner;
    const access = await getOrgAccess(orgId, userId);
    const mayChangeAdmins = Boolean(access && access.canSetGroupAdmins(groupId));
    const hasMetaChange = [name, color, icon].some(v => v !== undefined);
    const hasCodeChange = [regenerateCode, codeActive, codeExpiresAt, codeMaxUses].some(v => v !== undefined);
    const hasAdminChange = adminIds !== undefined;
    const inManagedGroup = Boolean(access && access.canManageGroup(groupId));

    if (!isAdmin) {
      if (!access?.isGroupAdmin || !inManagedGroup) {
        return res.status(403).json({ error: 'Only administrators can update groups' });
      }
      if (hasMetaChange && !access.settings.groupAdminsCanEditGroups) {
        return res.status(403).json({ error: 'Group admins cannot edit group details under current organization settings' });
      }
      if (hasCodeChange && !access.settings.groupAdminsCanRegenerateCodes) {
        return res.status(403).json({ error: 'Group admins cannot manage join codes under current organization settings' });
      }
      if (hasAdminChange && !access.canSetGroupAdmins(groupId)) {
        return res.status(403).json({ error: 'You do not have permission to change admins for this group' });
      }
      if (!hasMetaChange && !hasCodeChange && !hasAdminChange) {
        return res.status(403).json({ error: 'No permitted changes specified' });
      }
    }

    const [existing] = await db
      .select()
      .from(organizationGroups)
      .where(and(eq(organizationGroups.id, groupId), eq(organizationGroups.organizationId, orgId)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Group not found' });

    const updates: any = { updatedAt: new Date().toISOString() };
    if (name) updates.name = name.trim();
    if (color) updates.color = color;
    if (icon) updates.icon = icon;
    if (codeActive !== undefined) updates.codeActive = Boolean(codeActive);
    if (codeExpiresAt !== undefined) updates.codeExpiresAt = codeExpiresAt || null;
    if (codeMaxUses !== undefined) updates.codeMaxUses = codeMaxUses ? parseInt(codeMaxUses) : null;
    if (regenerateCode) {
      updates.joinCode = generateJoinCode();
      updates.codeUses = 0;
    }

    const [updated] = await db
      .update(organizationGroups)
      .set(updates)
      .where(eq(organizationGroups.id, groupId))
      .returning();

    let nextAdminIds: number[] | undefined;
    if (Array.isArray(adminIds) && mayChangeAdmins) {
      nextAdminIds = await setGroupAdmins(orgId, groupId, adminIds);
    }

    res.json({ group: { ...updated, ...(nextAdminIds ? { adminIds: nextAdminIds } : {}) }, message: 'Group updated successfully' });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// DELETE /api/organizations/:id/groups/:groupId - Delete group/sub-group
router.delete('/:id/groups/:groupId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const groupId = parseInt(req.params.groupId);
    const userId = req.userId!;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    const isOwner = org.ownerId === userId;
    const isAdmin = membership?.role === 'admin' || isOwner;
    if (!isAdmin) {
      const access = await getOrgAccess(orgId, userId);
      const target = access?.groups.find(g => g.id === groupId);
      const groupAdminMayDelete = Boolean(
        access &&
          target &&
          target.parentId != null &&
          (access.settings.groupAdminsCanEditGroups || access.settings.groupAdminsCanCreateSubgroups) &&
          access.adminGroupIds.has(target.parentId)
      );
      if (!groupAdminMayDelete) {
        return res.status(403).json({ error: 'Only administrators can delete groups' });
      }
    }

    // Delete sub-groups if this is a parent group
    const subGroups = await db
      .select()
      .from(organizationGroups)
      .where(and(eq(organizationGroups.parentId, groupId), eq(organizationGroups.organizationId, orgId)));

    const groupIdsToDelete = [groupId, ...subGroups.map(sg => sg.id)];

    for (const id of groupIdsToDelete) {
      await db.delete(organizationGroupMembers).where(eq(organizationGroupMembers.groupId, id));
      await db.delete(organizationGroupMembers).where(eq(organizationGroupMembers.subGroupId, id));
      await db.delete(organizationGroups).where(eq(organizationGroups.id, id));
    }

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// POST /api/organizations/:id/kick-member/:userId - Kick member from org
router.post('/:id/kick-member/:targetUserId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.targetUserId);
    const userId = req.userId!;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    const isOwner = org.ownerId === userId;
    const isAdmin = membership?.role === 'admin' || isOwner;
    if (!isAdmin) {
      const access = await getOrgAccess(orgId, userId);
      const [targetRow] = await db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUserId)))
        .limit(1);
      const groupAdminMayKick = Boolean(
        access && access.isGroupAdmin && access.settings.groupAdminsCanKick && targetRow && targetRow.role !== 'admin'
        && targetUserId !== userId && await isUserInManagedGroups(access, targetUserId)
      );
      if (!groupAdminMayKick) {
        return res.status(403).json({ error: 'Only administrators can kick members' });
      }
    }

    if (targetUserId === org.ownerId) {
      return res.status(400).json({ error: 'Cannot kick the organization owner' });
    }

    const [targetMembership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUserId)))
      .limit(1);

    if (!targetMembership) {
      return res.status(404).json({ error: 'Member not found in this organization' });
    }

    // Remove from group memberships
    await db
      .delete(organizationGroupMembers)
      .where(and(eq(organizationGroupMembers.organizationId, orgId), eq(organizationGroupMembers.userId, targetUserId)));

    await db
      .delete(organizationGroupAdmins)
      .where(and(eq(organizationGroupAdmins.organizationId, orgId), eq(organizationGroupAdmins.userId, targetUserId)));

    // Remove from organization members
    await db
      .delete(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUserId)));

    await syncOrganizationSeats(orgId);

    await reconcileUserOrgState(targetUserId);

    res.json({ message: 'Member kicked successfully' });
  } catch (error) {
    console.error('Kick member error:', error);
    res.status(500).json({ error: 'Failed to kick member' });
  }
});

// POST /api/organizations/:id/assign-member - Move or assign user between groups/sub-groups
router.post('/:id/assign-member', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = req.userId!;
    const { targetUserId, groupId, subGroupId } = req.body;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    const isOwner = org.ownerId === userId;
    const isAdmin = membership?.role === 'admin' || isOwner;
    const moveAccess = isAdmin ? null : await getOrgAccess(orgId, userId);
    if (!isAdmin && !(moveAccess?.isGroupAdmin && moveAccess.settings.groupAdminsCanMoveMembers)) {
      return res.status(403).json({ error: 'Only administrators can assign members' });
    }

    if (org.type === 'family') {
      return res.status(400).json({ error: 'Family organizations do not support groups' });
    }

    const tUserId = parseInt(targetUserId);
    const pGroupId = parseInt(groupId);
    const sGroupId = subGroupId ? parseInt(subGroupId) : null;

    if (isNaN(tUserId) || isNaN(pGroupId) || (subGroupId && (sGroupId === null || isNaN(sGroupId)))) {
      return res.status(400).json({ error: 'Valid targetUserId, groupId, and optional subGroupId are required' });
    }

    const [targetMember] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, tUserId)))
      .limit(1);

    if (!targetMember) {
      return res.status(404).json({ error: 'Target user is not a member of this organization' });
    }

    const [parentGroup] = await db
      .select()
      .from(organizationGroups)
      .where(and(eq(organizationGroups.id, pGroupId), eq(organizationGroups.organizationId, orgId)))
      .limit(1);

    if (!parentGroup || parentGroup.parentId !== null) {
      return res.status(404).json({ error: 'Target group not found in this organization' });
    }

    if (sGroupId !== null) {
      const [subGroup] = await db
        .select()
        .from(organizationGroups)
        .where(and(eq(organizationGroups.id, sGroupId), eq(organizationGroups.organizationId, orgId)))
        .limit(1);

      if (!subGroup || subGroup.parentId !== pGroupId) {
        return res.status(400).json({ error: 'Sub-group does not belong to the specified parent group in this organization' });
      }
    }

    if (moveAccess && !moveAccess.canManageGroup(sGroupId ?? pGroupId)) {
      return res.status(403).json({ error: 'You can only move members into groups you manage' });
    }

    // Rule: "A person can be in several groups, but in only one sub-group per group."
    // Remove existing assignment for this user in this parent group first
    await db
      .delete(organizationGroupMembers)
      .where(
        and(
          eq(organizationGroupMembers.organizationId, orgId),
          eq(organizationGroupMembers.userId, tUserId),
          eq(organizationGroupMembers.groupId, pGroupId)
        )
      );

    // Insert new assignment
    await db.insert(organizationGroupMembers).values({
      organizationId: orgId,
      groupId: pGroupId,
      subGroupId: sGroupId,
      userId: tUserId,
    });

    res.json({ message: 'Member assigned successfully' });
  } catch (error) {
    console.error('Assign member error:', error);
    res.status(500).json({ error: 'Failed to assign member' });
  }
});

// POST /api/organizations/:id/remove-from-group - Remove user from a specific group
router.post('/:id/remove-from-group', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = req.userId!;
    const { targetUserId, groupId } = req.body;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    const isOwner = org.ownerId === userId;
    const isAdmin = membership?.role === 'admin' || isOwner;
    if (!isAdmin) {
      const access = await getOrgAccess(orgId, userId);
      if (!(access?.isGroupAdmin && access.settings.groupAdminsCanMoveMembers && access.canManageGroup(parseInt(groupId)))) {
        return res.status(403).json({ error: 'Only administrators can modify group members' });
      }
    }

    await db
      .delete(organizationGroupMembers)
      .where(
        and(
          eq(organizationGroupMembers.organizationId, orgId),
          eq(organizationGroupMembers.userId, parseInt(targetUserId)),
          eq(organizationGroupMembers.groupId, parseInt(groupId))
        )
      );

    res.json({ message: 'Member removed from group' });
  } catch (error) {
    console.error('Remove from group error:', error);
    res.status(500).json({ error: 'Failed to remove from group' });
  }
});

// POST /api/organizations/:id/admins - Add or remove administrator role (owner only)
router.post('/:id/admins', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = req.userId!;
    const { targetUserId, action } = req.body;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the organization owner can manage administrators' });
    }

    const tUserId = parseInt(targetUserId);
    if (tUserId === org.ownerId) {
      return res.status(400).json({ error: 'Cannot modify owner role' });
    }

    const newRole = action === 'add' ? 'admin' : 'member';

    await db
      .update(organizationMembers)
      .set({ role: newRole, updatedAt: new Date().toISOString() })
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, tUserId)));

    res.json({ message: `Administrator ${action === 'add' ? 'added' : 'removed'} successfully` });
  } catch (error) {
    console.error('Manage admin error:', error);
    res.status(500).json({ error: 'Failed to update administrator role' });
  }
});

// POST /api/organizations/:id/transfer-ownership - Transfer ownership (owner only)
router.post('/:id/transfer-ownership', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = req.userId!;
    const { newOwnerId } = req.body;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the current owner can transfer ownership' });
    }

    const nOwnerId = parseInt(newOwnerId);
    if (isNaN(nOwnerId) || nOwnerId === userId) {
      return res.status(400).json({ error: 'Invalid new owner' });
    }

    // Verify new owner is a member
    const [targetMembership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, nOwnerId)))
      .limit(1);

    if (!targetMembership) {
      return res.status(400).json({ error: 'New owner must already be a member of this organization' });
    }

    // Update organization owner
    await db
      .update(organizations)
      .set({ ownerId: nOwnerId, updatedAt: new Date().toISOString() })
      .where(eq(organizations.id, orgId));

    // Update previous owner to admin
    await db
      .update(organizationMembers)
      .set({ role: 'admin', updatedAt: new Date().toISOString() })
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)));

    // Update new owner role
    await db
      .update(organizationMembers)
      .set({ role: 'owner', updatedAt: new Date().toISOString() })
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, nOwnerId)));

    res.json({ message: 'Ownership transferred successfully' });
  } catch (error) {
    console.error('Transfer ownership error:', error);
    res.status(500).json({ error: 'Failed to transfer ownership' });
  }
});

// POST /api/organizations/join - Join organization via code (group, sub-group, or root code)
router.post('/join', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const rawCode = (req.body.code || '').trim().toUpperCase();

    if (!rawCode) {
      return res.status(400).json({ error: 'Join code is required' });
    }

    // Rate limiting check
    const clientIp = req.ip || String(userId);
    if (!checkJoinRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Too many join attempts. Please wait 1 minute.' });
    }

    // First check if the code matches a group or sub-group
    const [matchingGroup] = await db
      .select()
      .from(organizationGroups)
      .where(eq(organizationGroups.joinCode, rawCode))
      .limit(1);

    let orgId: number;
    let targetGroup: any = null;

    if (matchingGroup) {
      orgId = matchingGroup.organizationId;
      targetGroup = matchingGroup;
    } else {
      // Check if it matches an organization root code
      const [matchingOrg] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.joinCode, rawCode))
        .limit(1);

      if (!matchingOrg) {
        return res.status(404).json({ error: 'Invalid join code. Please check and try again.' });
      }
      orgId = matchingOrg.id;
    }

    // Fetch organization
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    if (!['active', 'trialing'].includes(String(org.status || '').toLowerCase())) {
      return res.status(400).json({ error: 'This organization plan is not currently active.' });
    }

    // Validate group code status if joined via group
    if (targetGroup) {
      const joinOrgSettings = parseOrgSettings((org as any).settings);
      if (!joinOrgSettings.allowJoinViaGroupCode) {
        return res.status(403).json({ error: 'Joining via group codes is disabled by organization settings. Use the main organization join code instead.' });
      }
      if (targetGroup.codeActive === false) {
        return res.status(400).json({ error: 'This join code has been deactivated.' });
      }
      if (targetGroup.codeExpiresAt && new Date(targetGroup.codeExpiresAt) < new Date()) {
        return res.status(400).json({ error: 'This join code has expired.' });
      }
      if (targetGroup.codeMaxUses != null && targetGroup.codeUses >= targetGroup.codeMaxUses) {
        return res.status(400).json({ error: 'This join code has reached its maximum uses.' });
      }
    }

    // Check existing membership
    const [existingMembership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    if (!existingMembership) {
      // Check seat limit: "If a code is used when all seats are taken, the person sees 'Organization is full' and can't join."
      const liveMemberCount = await countOrganizationMembers(orgId);
      if (liveMemberCount >= org.maxSeats) {
        return res.status(400).json({ error: 'Organization is full' });
      }

      // Add to organization members
      await db.insert(organizationMembers).values({
        organizationId: orgId,
        userId,
        role: 'member',
      });

      // Sync current seats from live member count
      await syncOrganizationSeats(orgId);
    }

    // If joined with a group/sub-group code, assign member accordingly:
    // "A sub-group code puts the person in that sub-group and its parent group."
    // If joining via a parent group code while already in a sub-group of that parent, keep that sub-group!
    if (targetGroup) {
      const isSubGroup = targetGroup.parentId != null;
      const parentGroupId = isSubGroup ? targetGroup.parentId : targetGroup.id;

      const existingInParent = await db
        .select()
        .from(organizationGroupMembers)
        .where(
          and(
            eq(organizationGroupMembers.organizationId, orgId),
            eq(organizationGroupMembers.userId, userId),
            eq(organizationGroupMembers.groupId, parentGroupId)
          )
        )
        .limit(1);

      const preservedSubGroupId =
        !isSubGroup && existingInParent[0]?.subGroupId != null ? existingInParent[0].subGroupId : null;
      const subGroupId = isSubGroup ? targetGroup.id : preservedSubGroupId;

      // Remove any prior assignment in this parent group to prevent multiple sub-groups
      await db
        .delete(organizationGroupMembers)
        .where(
          and(
            eq(organizationGroupMembers.organizationId, orgId),
            eq(organizationGroupMembers.userId, userId),
            eq(organizationGroupMembers.groupId, parentGroupId)
          )
        );

      await db.insert(organizationGroupMembers).values({
        organizationId: orgId,
        groupId: parentGroupId,
        subGroupId: subGroupId,
        userId,
      });

      // Increment code uses
      await db
        .update(organizationGroups)
        .set({ codeUses: (targetGroup.codeUses || 0) + 1 })
        .where(eq(organizationGroups.id, targetGroup.id));
    }

    const plan = await reconcileUserOrgState(userId);

    res.json({
      success: true,
      message: `Successfully joined ${org.name}!`,
      organization: {
        id: org.id,
        name: org.name,
        tier: org.tier,
      },
      effectiveTier: plan.tier,
      personalPlanPaused: plan.personalPlanPaused,
      reservedOrgTier: plan.reservedOrgTier,
    });
  } catch (error) {
    console.error('Join organization error:', error);
    res.status(500).json({ error: 'Failed to join organization' });
  }
});

// POST /api/organizations/:id/leave - Leave an organization
router.post('/:id/leave', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = req.userId!;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    if (org.ownerId === userId) {
      return res.status(400).json({ error: 'Organization owners cannot leave. Transfer ownership or delete the organization.' });
    }

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      return res.status(400).json({ error: 'You are not a member of this organization' });
    }

    // Clean up group assignments
    await db
      .delete(organizationGroupMembers)
      .where(and(eq(organizationGroupMembers.organizationId, orgId), eq(organizationGroupMembers.userId, userId)));

    // Remove from organization
    await db
      .delete(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)));

    // Sync current seats from live member count
    await syncOrganizationSeats(orgId);

    const plan = await reconcileUserOrgState(userId);

    res.json({
      message: 'Successfully left organization',
      effectiveTier: plan.tier,
      personalPlanPaused: plan.personalPlanPaused,
      archivedAttachmentCount: plan.archivedAttachmentCount,
    });
  } catch (error) {
    console.error('Leave organization error:', error);
    res.status(500).json({ error: 'Failed to leave organization' });
  }
});

export default router;
