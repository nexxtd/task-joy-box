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

export interface OrgMemberAssignment {
  groupId: number;
  subGroupId: number | null;
}

export interface OrgMemberItem {
  id: number;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
  lastActiveAt?: string | null;
  groups?: string[];
  subGroups?: string[];
  isOwner?: boolean;
  isAdmin?: boolean;
  assignments?: OrgMemberAssignment[];
  adminOfGroupIds?: number[];
}

export interface OrgSubGroupItem {
  id: number;
  parentId: number;
  name: string;
  color: string;
  icon: string;
  joinCode: string;
  codeActive: boolean;
  codeExpiresAt?: string | null;
  codeMaxUses?: number | null;
  codeUses: number;
  memberCount: number;
  memberIds: number[];
  adminIds?: number[];
}

export interface OrgGroupItem {
  id: number;
  name: string;
  color: string;
  icon: string;
  joinCode: string;
  codeActive: boolean;
  codeExpiresAt?: string | null;
  codeMaxUses?: number | null;
  codeUses: number;
  memberCount: number;
  directMemberCount: number;
  directMemberIds: number[];
  adminIds?: number[];
  subGroups: OrgSubGroupItem[];
}

