import { db } from '../db.js';
import {
  organizations,
  organizationMembers,
  organizationGroups,
  organizationGroupAdmins,
  organizationGroupMembers,
} from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Org-level switches for what group admins (admins of a single group or sub-group) may do.
 * Stored as JSON in organizations.settings and edited in the org Settings tab.
 */
export interface OrgAdminSettings {
  groupAdminsEnabled: boolean;
  groupAdminsCanManageSubgroupAdmins: boolean;
  groupAdminsCanMoveMembers: boolean;
  groupAdminsCanEditGroups: boolean;
  groupAdminsCanCreateSubgroups: boolean;
  groupAdminsCanRegenerateCodes: boolean;
  groupAdminsCanKick: boolean;
  groupAdminsCanUseNotes: boolean;
  groupAdminsCanEditAnyNote: boolean;
  groupAdminsCanViewAllMembers: boolean;
  showMemberLastActive: boolean;
  showMemberEmailsToGroupAdmins: boolean;
  allowJoinViaGroupCode: boolean;
}

export const DEFAULT_ORG_ADMIN_SETTINGS: OrgAdminSettings = {
  groupAdminsEnabled: true,
  groupAdminsCanManageSubgroupAdmins: true,
  groupAdminsCanMoveMembers: true,
  groupAdminsCanEditGroups: true,
  groupAdminsCanCreateSubgroups: true,
  groupAdminsCanRegenerateCodes: true,
  groupAdminsCanKick: false,
  groupAdminsCanUseNotes: true,
  groupAdminsCanEditAnyNote: false,
  groupAdminsCanViewAllMembers: false,
  showMemberLastActive: true,
  showMemberEmailsToGroupAdmins: true,
  allowJoinViaGroupCode: true,
};

export function parseOrgSettings(raw: unknown): OrgAdminSettings {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === 'string' && raw.trim()) {
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }
  const out = { ...DEFAULT_ORG_ADMIN_SETTINGS };
  (Object.keys(out) as Array<keyof OrgAdminSettings>).forEach(key => {
    if (typeof parsed[key] === 'boolean') out[key] = parsed[key] as boolean;
  });
  return out;
}

export interface OrgAccess {
  org: typeof organizations.$inferSelect;
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  settings: OrgAdminSettings;
  /** Groups/sub-groups this user is directly an admin of. */
  adminGroupIds: Set<number>;
  /** Everything the user can manage as a group admin: their groups plus sub-groups of parent groups they admin. */
  managedGroupIds: Set<number>;
  /** True when group admins are enabled and this user admins at least one group (and is not an org admin). */
  isGroupAdmin: boolean;
  groups: Array<typeof organizationGroups.$inferSelect>;
  canManageGroup: (groupId: number | null | undefined) => boolean;
  /** Can this user set the admins of the given group/sub-group? */
  canSetGroupAdmins: (groupId: number) => boolean;
}

export async function getOrgAccess(orgId: number, userId: number): Promise<OrgAccess | null> {
  if (!Number.isFinite(orgId)) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return null;

  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
    .limit(1);

  const isOwner = org.ownerId === userId;
  const isMember = Boolean(membership) || isOwner;
  const isAdmin = isOwner || membership?.role === 'admin';
  const settings = parseOrgSettings((org as any).settings);

  const groups = await db.select().from(organizationGroups).where(eq(organizationGroups.organizationId, orgId));
  const adminRows = isMember
    ? await db
        .select()
        .from(organizationGroupAdmins)
        .where(and(eq(organizationGroupAdmins.organizationId, orgId), eq(organizationGroupAdmins.userId, userId)))
    : [];

  const adminGroupIds = new Set<number>(adminRows.map(r => r.groupId));
  const managedGroupIds = new Set<number>();
  if (settings.groupAdminsEnabled) {
    adminGroupIds.forEach(gid => {
      managedGroupIds.add(gid);
      groups.filter(g => g.parentId === gid).forEach(sub => managedGroupIds.add(sub.id));
    });
  }

  const isGroupAdmin = !isAdmin && isMember && managedGroupIds.size > 0;

  const canManageGroup = (groupId: number | null | undefined) => {
    if (isAdmin) return true;
    if (groupId == null) return false;
    return managedGroupIds.has(groupId);
  };

  const canSetGroupAdmins = (groupId: number) => {
    if (isAdmin) return true;
    if (!settings.groupAdminsEnabled || !settings.groupAdminsCanManageSubgroupAdmins) return false;
    const target = groups.find(g => g.id === groupId);
    // Group admins may only edit the admins of sub-groups under a parent group they directly admin.
    return Boolean(target && target.parentId != null && adminGroupIds.has(target.parentId));
  };

  return {
    org,
    isMember,
    isOwner,
    isAdmin,
    settings,
    adminGroupIds,
    managedGroupIds,
    isGroupAdmin,
    groups,
    canManageGroup,
    canSetGroupAdmins,
  };
}

/** Is the target user assigned anywhere inside the groups this access can manage? */
export async function isUserInManagedGroups(access: OrgAccess, targetUserId: number): Promise<boolean> {
  if (access.isAdmin) return true;
  const rows = await db
    .select()
    .from(organizationGroupMembers)
    .where(and(eq(organizationGroupMembers.organizationId, access.org.id), eq(organizationGroupMembers.userId, targetUserId)));
  return rows.some(r => access.managedGroupIds.has(r.groupId) || (r.subGroupId != null && access.managedGroupIds.has(r.subGroupId)));
}
