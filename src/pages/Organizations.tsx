import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  Users,
  FolderKanban,
  Settings,
  Plus,
  Search,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  Shield,
  ShieldAlert,
  Crown,
  Sparkles,
  ArrowLeft,
  X,
  LayoutList,
  Kanban,
  GripVertical,
  UserX,
  Info,
  Clock,
  AlertTriangle,
  Folder,
  BookOpen,
  Briefcase,
  Code2,
  Palette,
  Music,
  FlaskConical,
  Globe,
  Star,
  GraduationCap,
  Award,
  Layers,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { toast } from '@/hooks/use-toast';

const COLUMN_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6',
  '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e',
];

const GROUP_ICON_OPTIONS: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'folder', label: 'Folder', icon: Folder },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'graduation', label: 'Academic', icon: GraduationCap },
  { key: 'book', label: 'Book', icon: BookOpen },
  { key: 'briefcase', label: 'Team', icon: Briefcase },
  { key: 'code', label: 'Code', icon: Code2 },
  { key: 'flask', label: 'Science', icon: FlaskConical },
  { key: 'palette', label: 'Art', icon: Palette },
  { key: 'music', label: 'Music', icon: Music },
  { key: 'globe', label: 'Global', icon: Globe },
  { key: 'star', label: 'Star', icon: Star },
  { key: 'award', label: 'Honors', icon: Award },
  { key: 'layers', label: 'Layers', icon: Layers },
  { key: 'sparkles', label: 'Sparkles', icon: Sparkles },
];

const renderGroupIcon = (iconValue?: string | null, fallback = 'folder') => {
  const normalized = (iconValue || fallback).trim().toLowerCase();
  const matched = GROUP_ICON_OPTIONS.find(o => o.key === normalized);
  if (matched) {
    const IconComp = matched.icon;
    return <IconComp className="w-4 h-4 flex-shrink-0 text-foreground" />;
  }
  if (!iconValue || iconValue === '📁' || iconValue === '🏷️') {
    const IconComp = normalized === 'layers' || iconValue === '🏷️' ? Layers : Folder;
    return <IconComp className="w-4 h-4 flex-shrink-0 text-foreground" />;
  }
  return <span className="text-sm leading-none">{iconValue}</span>;
};

const formatLastActive = (val?: string | null): string => {
  if (!val) return 'Never';
  const d = new Date(val);
  if (isNaN(d.getTime())) return 'Never';
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toDatetimeLocalInput = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const getSchoolPerSeatMonthlyRate = (seats: number): number => {
  if (seats <= 20) return 4.0;
  if (seats <= 50) return 3.5;
  if (seats <= 100) return 3.0;
  if (seats <= 250) return 2.5;
  return 2.0;
};

interface OrgSummary {
  id: number;
  name: string;
  type: 'school' | 'family' | 'business';
  ownerId: number;
  maxSeats: number;
  currentSeats: number;
  tier: 'premium' | 'pro';
  status: string;
  role: 'owner' | 'admin' | 'member';
  isOwner: boolean;
  isAdmin: boolean;
  createdAt: string;
}

interface Member {
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
}

interface SubGroup {
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
}

interface Group {
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
  subGroups: SubGroup[];
}

interface OrgDetail {
  id: number;
  name: string;
  type: 'school' | 'family' | 'business';
  ownerId: number;
  maxSeats: number;
  currentSeats: number;
  tier: 'premium' | 'pro';
  status: string;
  joinCode?: string;
  createdAt: string;
}

const Organizations: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  // Organizations list
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<OrgSummary[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(() => {
    const idParam = searchParams.get('id');
    return idParam ? parseInt(idParam) : null;
  });

  // Current Org Detail
  const [detailLoading, setDetailLoading] = useState(false);
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [unassignedMembers, setUnassignedMembers] = useState<Member[]>([]);
  const [userRole, setUserRole] = useState<string>('member');
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Active Tab: Users, Groups, Both, Settings
  const [activeTab, setActiveTab] = useState<'users' | 'groups' | 'both' | 'settings'>('users');
  const [bothViewMode, setBothViewMode] = useState<'list' | 'board'>('list');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');

  // Expand / Collapse state for groups and sub-groups in Both Tab
  const [collapsedGroups, setCollapsedGroups] = useState<Record<number, boolean>>({});
  const [collapsedSubGroups, setCollapsedSubGroups] = useState<Record<number, boolean>>({});

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<'family' | 'school'>('school');
  const [createSeats, setCreateSeats] = useState(10);
  const [createTier, setCreateTier] = useState<'pro' | 'premium'>('pro');
  const [createLoading, setCreateLoading] = useState(false);

  // Edit Column Style Popup for Groups / Sub-groups
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<'create-group' | 'create-subgroup' | 'edit-group' | 'edit-subgroup'>('create-group');
  const [targetParentGroupId, setTargetParentGroupId] = useState<number | null>(null);
  const [targetEditGroupId, setTargetEditGroupId] = useState<number | null>(null);
  const [groupEditName, setGroupEditName] = useState('');
  const [groupEditColor, setGroupEditColor] = useState('#3b82f6');
  const [groupEditIcon, setGroupEditIcon] = useState('folder');
  const [groupEditCodeActive, setGroupEditCodeActive] = useState(true);
  const [groupEditCodeExpiresAt, setGroupEditCodeExpiresAt] = useState('');
  const [groupEditCodeMaxUses, setGroupEditCodeMaxUses] = useState('');
  const [groupModalLoading, setGroupModalLoading] = useState(false);

  // Drag and Drop State
  const [draggedUserId, setDraggedUserId] = useState<number | null>(null);
  const [draggedSourceGroupId, setDraggedSourceGroupId] = useState<number | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);

  // Settings tab form state
  const [settingsName, setSettingsName] = useState('');
  const [settingsSeats, setSettingsSeats] = useState(1);
  const [settingsTier, setSettingsTier] = useState<'premium' | 'pro'>('pro');
  const [settingsBillingPeriod, setSettingsBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [billingLoading, setBillingLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [newAdminUserId, setNewAdminUserId] = useState<number | ''>('');
  const [transferOwnerUserId, setTransferOwnerUserId] = useState<number | ''>('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Feedback for copied codes
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchOrganizationsList = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/organizations', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const list = data.organizations || [];
        setOrganizations(list);
        const paramId = searchParams.get('id');
        if (paramId) {
          const parsedParam = parseInt(paramId, 10);
          if (!isNaN(parsedParam)) {
            setSelectedOrgId(parsedParam);
          }
        } else if (list.length > 0 && selectedOrgId === null) {
          setSelectedOrgId(list[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load organizations', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgDetails = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/organizations/${id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOrgDetail(data.organization);
        setMembers(data.members || []);
        setGroups(data.groups || []);
        setUnassignedMembers(data.unassignedMembers || []);
        setUserRole(data.userRole || 'member');
        const ownerFlag = Boolean(data.isOwner);
        setIsOwner(ownerFlag);
        setIsAdmin(Boolean(data.isAdmin));
        setSettingsName(data.organization?.name || '');
        setSettingsSeats(data.organization?.maxSeats || 1);
        setSettingsTier(data.organization?.tier === 'premium' ? 'premium' : 'pro');

        // Adjust tab if family org or non-owner on settings
        if (data.organization?.type === 'family' && (activeTab === 'groups' || activeTab === 'both')) {
          setActiveTab('users');
        } else if (!ownerFlag && activeTab === 'settings') {
          setActiveTab('users');
        }
      } else {
        toast({ title: 'Error', description: 'Could not load organization details', variant: 'destructive' });
      }
    } catch (e) {
      console.error('Failed to load org details', e);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizationsList();
  }, []);

  const urlOrgIdParam = searchParams.get('id');
  useEffect(() => {
    if (!urlOrgIdParam) return;
    const parsed = parseInt(urlOrgIdParam, 10);
    if (!isNaN(parsed) && parsed !== selectedOrgId) {
      setSelectedOrgId(parsed);
    }
  }, [urlOrgIdParam]);

  useEffect(() => {
    if (selectedOrgId !== null) {
      if (searchParams.get('id') !== String(selectedOrgId)) {
        setSearchParams({ id: String(selectedOrgId) }, { replace: true });
      }
      fetchOrgDetails(selectedOrgId);
    }
  }, [selectedOrgId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    toast({ title: 'Copied code!', description: `${text} copied to clipboard` });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Filtered members for Users tab (searchable by name, email, group, sub-group, and last active)
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(m => {
      if (m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) return true;
      if ((m.groups || []).some(g => g.toLowerCase().includes(q))) return true;
      if ((m.subGroups || []).some(sg => sg.toLowerCase().includes(q))) return true;
      const formattedActive = formatLastActive(m.lastActiveAt).toLowerCase();
      if (formattedActive.includes(q)) return true;
      if (m.lastActiveAt && m.lastActiveAt.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [members, searchQuery]);

  // Handle Drag & Drop of users between sub-groups, direct groups, and unassigned
  const handleDragStart = (e: React.DragEvent, userId: number, sourceGroupId?: number | null) => {
    e.dataTransfer.setData('application/x-org-member', String(userId));
    if (sourceGroupId != null) {
      e.dataTransfer.setData('application/x-org-source-group', String(sourceGroupId));
      setDraggedSourceGroupId(sourceGroupId);
    } else {
      setDraggedSourceGroupId(null);
    }
    e.dataTransfer.effectAllowed = 'move';
    setDraggedUserId(userId);
  };

  const handleDragOver = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTargetId(targetKey);
  };

  const handleDragLeave = () => {
    setDragOverTargetId(null);
  };

  const handleDropOnSubGroup = async (e: React.DragEvent, parentGroupId: number, subGroupId: number | null) => {
    e.preventDefault();
    setDragOverTargetId(null);
    const rawUserId = e.dataTransfer.getData('application/x-org-member') || String(draggedUserId);
    const userId = parseInt(rawUserId);
    if (!userId || !selectedOrgId) return;

    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/assign-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetUserId: userId,
          groupId: parentGroupId,
          subGroupId: subGroupId,
        }),
      });
      if (res.ok) {
        toast({ title: 'Moved member', description: subGroupId ? 'Member moved to sub-group' : 'Member assigned directly to group' });
        fetchOrgDetails(selectedOrgId);
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to move member', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to assign member', variant: 'destructive' });
    } finally {
      setDraggedUserId(null);
      setDraggedSourceGroupId(null);
    }
  };

  const handleDropOnUnassigned = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTargetId(null);
    const rawUserId = e.dataTransfer.getData('application/x-org-member') || String(draggedUserId);
    const rawSourceGroupId = e.dataTransfer.getData('application/x-org-source-group');
    const userId = parseInt(rawUserId);
    if (!userId || !selectedOrgId) return;

    const sourceGroupId = rawSourceGroupId ? parseInt(rawSourceGroupId) : draggedSourceGroupId;
    try {
      const groupIdsToRemove = sourceGroupId
        ? [sourceGroupId]
        : groups
            .filter(
              g =>
                g.directMemberIds.includes(userId) ||
                g.subGroups.some(sg => sg.memberIds.includes(userId))
            )
            .map(g => g.id);

      if (groupIdsToRemove.length === 0) return;

      await Promise.all(
        groupIdsToRemove.map(gid =>
          fetch(`/api/organizations/${selectedOrgId}/remove-from-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ targetUserId: userId, groupId: gid }),
          })
        )
      );
      toast({ title: 'Unassigned member', description: 'Member removed from group assignment.' });
      fetchOrgDetails(selectedOrgId);
    } catch {
      toast({ title: 'Error', description: 'Failed to unassign member', variant: 'destructive' });
    } finally {
      setDraggedUserId(null);
      setDraggedSourceGroupId(null);
    }
  };

  // Kick member action
  const handleKickMember = async (targetUserId: number, targetName: string) => {
    if (!selectedOrgId) return;
    if (!confirm(`Are you sure you want to kick ${targetName} from the organization? Their plan access will immediately end.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/kick-member/${targetUserId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast({ title: 'Kicked member', description: `${targetName} was removed from the organization.` });
        fetchOrgDetails(selectedOrgId);
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to kick member', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to kick member', variant: 'destructive' });
    }
  };

  // Create Group or Subgroup
  const openCreateGroupModal = () => {
    setGroupModalMode('create-group');
    setTargetParentGroupId(null);
    setTargetEditGroupId(null);
    setGroupEditName('');
    setGroupEditColor('#3b82f6');
    setGroupEditIcon('folder');
    setGroupEditCodeActive(true);
    setGroupEditCodeExpiresAt('');
    setGroupEditCodeMaxUses('');
    setGroupModalOpen(true);
  };

  const openCreateSubGroupModal = (group: Group) => {
    setGroupModalMode('create-subgroup');
    setTargetParentGroupId(group.id);
    setTargetEditGroupId(null);
    setGroupEditName('');
    setGroupEditColor(group.color || '#3b82f6');
    setGroupEditIcon('layers');
    setGroupEditCodeActive(true);
    setGroupEditCodeExpiresAt('');
    setGroupEditCodeMaxUses('');
    setGroupModalOpen(true);
  };

  const openEditGroupModal = (item: Group | SubGroup, mode: 'edit-group' | 'edit-subgroup') => {
    setGroupModalMode(mode);
    setTargetEditGroupId(item.id);
    setTargetParentGroupId('parentId' in item ? item.parentId : null);
    setGroupEditName(item.name);
    setGroupEditColor(item.color || '#3b82f6');
    setGroupEditIcon(item.icon || (mode === 'edit-group' ? 'folder' : 'layers'));
    setGroupEditCodeActive(item.codeActive !== false);
    setGroupEditCodeExpiresAt(toDatetimeLocalInput(item.codeExpiresAt));
    setGroupEditCodeMaxUses(item.codeMaxUses != null ? String(item.codeMaxUses) : '');
    setGroupModalOpen(true);
  };

  const handleSaveGroupModal = async () => {
    if (!selectedOrgId || !groupEditName.trim()) return;
    setGroupModalLoading(true);
    const parsedMaxUses = groupEditCodeMaxUses.trim() ? parseInt(groupEditCodeMaxUses.trim(), 10) : null;
    const expiresIso = groupEditCodeExpiresAt.trim() ? new Date(groupEditCodeExpiresAt).toISOString() : null;
    try {
      if (groupModalMode === 'create-group') {
        const res = await fetch(`/api/organizations/${selectedOrgId}/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: groupEditName.trim(),
            color: groupEditColor,
            icon: groupEditIcon,
            codeExpiresAt: expiresIso,
            codeMaxUses: parsedMaxUses,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast({ title: 'Group created', description: `${groupEditName} added successfully` });
          setGroupModalOpen(false);
          fetchOrgDetails(selectedOrgId);
        } else {
          toast({ title: 'Error', description: data.error || 'Failed to create group', variant: 'destructive' });
        }
      } else if (groupModalMode === 'create-subgroup') {
        const res = await fetch(`/api/organizations/${selectedOrgId}/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            parentId: targetParentGroupId,
            name: groupEditName.trim(),
            color: groupEditColor,
            icon: groupEditIcon,
            codeExpiresAt: expiresIso,
            codeMaxUses: parsedMaxUses,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast({ title: 'Sub-group created', description: `${groupEditName} added successfully` });
          setGroupModalOpen(false);
          fetchOrgDetails(selectedOrgId);
        } else {
          toast({ title: 'Error', description: data.error || 'Failed to create sub-group', variant: 'destructive' });
        }
      } else if (groupModalMode === 'edit-group' || groupModalMode === 'edit-subgroup') {
        if (!targetEditGroupId) return;
        const res = await fetch(`/api/organizations/${selectedOrgId}/groups/${targetEditGroupId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: groupEditName.trim(),
            color: groupEditColor,
            icon: groupEditIcon,
            codeActive: groupEditCodeActive,
            codeExpiresAt: expiresIso,
            codeMaxUses: parsedMaxUses,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast({ title: 'Updated', description: 'Group updated successfully' });
          setGroupModalOpen(false);
          fetchOrgDetails(selectedOrgId);
        } else {
          toast({ title: 'Error', description: data.error || 'Failed to update group', variant: 'destructive' });
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save group', variant: 'destructive' });
    } finally {
      setGroupModalLoading(false);
    }
  };

  // Regenerate Join Code
  const handleRegenerateCode = async (groupId: number) => {
    if (!selectedOrgId) return;
    if (!confirm('Regenerate join code? Existing members will stay in the group, but future users will need the new code.')) {
      return;
    }
    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ regenerateCode: true }),
      });
      if (res.ok) {
        toast({ title: 'Regenerated', description: 'A new join code was created.' });
        fetchOrgDetails(selectedOrgId);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to regenerate code', variant: 'destructive' });
    }
  };

  // Toggle Code Active
  const handleToggleCodeActive = async (groupId: number, currentActive: boolean) => {
    if (!selectedOrgId) return;
    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ codeActive: !currentActive }),
      });
      if (res.ok) {
        toast({
          title: !currentActive ? 'Code activated' : 'Code paused',
          description: !currentActive ? 'Users can join with this code now.' : 'This code cannot be used to join until reactivated.',
        });
        fetchOrgDetails(selectedOrgId);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle code status', variant: 'destructive' });
    }
  };

  // Delete Group or Subgroup
  const handleDeleteGroup = async (groupId: number, groupName: string) => {
    if (!selectedOrgId) return;
    if (!confirm(`Are you sure you want to delete ${groupName}? Any sub-groups and group codes will also be removed.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast({ title: 'Deleted', description: `${groupName} was deleted.` });
        fetchOrgDetails(selectedOrgId);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete group', variant: 'destructive' });
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    if (!selectedOrgId) return;
    setSettingsSaving(true);
    setSettingsError('');
    try {
      const payload: Record<string, any> = {
        name: settingsName.trim(),
      };
      if (orgDetail?.type !== 'family') {
        payload.maxSeats = settingsSeats;
        payload.tier = settingsTier;
      }
      const res = await fetch(`/api/organizations/${selectedOrgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Saved', description: 'Organization settings saved successfully.' });
        fetchOrgDetails(selectedOrgId);
        fetchOrganizationsList();
        window.dispatchEvent(new Event('orgs-refresh'));
      } else {
        setSettingsError(data.error || 'Failed to save settings');
      }
    } catch {
      setSettingsError('Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Start PayPal Billing Upgrade / Seat Checkout for Organization
  const handleUpgradeBilling = async () => {
    if (!selectedOrgId || !orgDetail) return;
    setBillingLoading(true);
    setSettingsError('');
    try {
      const res = await fetch('/api/payment/create-org-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orgId: selectedOrgId,
          tier: orgDetail.type === 'family' ? 'pro' : settingsTier,
          seats: orgDetail.type === 'family' ? 5 : settingsSeats,
          billingPeriod: settingsBillingPeriod,
        }),
      });
      const data = await res.json();
      if (res.ok && data.approvalUrl) {
        window.location.href = data.approvalUrl;
      } else {
        setSettingsError(data.error || 'Could not start billing checkout');
      }
    } catch {
      setSettingsError('Could not connect to billing checkout');
    } finally {
      setBillingLoading(false);
    }
  };

  // Add Admin
  const handleAddAdmin = async () => {
    if (!selectedOrgId || !newAdminUserId) return;
    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId: newAdminUserId, action: 'add' }),
      });
      if (res.ok) {
        toast({ title: 'Admin added', description: 'Administrator privileges granted.' });
        setNewAdminUserId('');
        fetchOrgDetails(selectedOrgId);
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to add admin', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to add admin', variant: 'destructive' });
    }
  };

  // Remove Admin
  const handleRemoveAdmin = async (targetUserId: number) => {
    if (!selectedOrgId) return;
    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId, action: 'remove' }),
      });
      if (res.ok) {
        toast({ title: 'Admin removed', description: 'Administrator privileges revoked.' });
        fetchOrgDetails(selectedOrgId);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to remove admin', variant: 'destructive' });
    }
  };

  // Transfer Ownership
  const handleTransferOwnership = async () => {
    if (!selectedOrgId || !transferOwnerUserId) return;
    if (!confirm('Transfer ownership? You will lose billing and delete permissions and become an administrator.')) {
      return;
    }
    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newOwnerId: transferOwnerUserId }),
      });
      if (res.ok) {
        toast({ title: 'Ownership Transferred', description: 'New owner assigned.' });
        setTransferOwnerUserId('');
        setActiveTab('users');
        fetchOrgDetails(selectedOrgId);
        fetchOrganizationsList();
        window.dispatchEvent(new Event('orgs-refresh'));
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to transfer ownership', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to transfer ownership', variant: 'destructive' });
    }
  };

  // Delete Organization
  const handleDeleteOrg = async () => {
    if (!selectedOrgId) return;
    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast({ title: 'Deleted', description: 'Organization has been deleted.' });
        setSelectedOrgId(null);
        setOrgDetail(null);
        fetchOrganizationsList();
        window.dispatchEvent(new Event('orgs-refresh'));
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete organization', variant: 'destructive' });
    }
  };

  // If loading organizations initially
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <span className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground font-medium">Loading organizations…</p>
        </div>
      </div>
    );
  }

  const renderCreateOrgModal = () =>
    createModalOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl text-left space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">New Organization</h3>
            <button onClick={() => setCreateModalOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase">Organization Name</label>
            <input
              type="text"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder="e.g. Springfield High or Smith Family"
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase">Plan Type</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => {
                  setCreateType('school');
                  setCreateSeats(10);
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  createType === 'school' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <p className="text-xs font-bold text-foreground">School / Team</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Custom seats, groups & sub-groups</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateType('family');
                  setCreateSeats(5);
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  createType === 'family' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <p className="text-xs font-bold text-foreground">Family</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">5 seats fixed, simplified view</p>
              </button>
            </div>
          </div>

          {createType === 'school' && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase">Seat Capacity</label>
              <input
                type="number"
                min={1}
                max={5000}
                value={createSeats}
                onChange={e => setCreateSeats(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Owner uses 1 seat. Remaining seats can be joined via codes.</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={createLoading || !createName.trim()}
              onClick={async () => {
                setCreateLoading(true);
                try {
                  const res = await fetch('/api/organizations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      name: createName.trim(),
                      type: createType,
                      maxSeats: createSeats,
                      tier: createTier,
                    }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    toast({ title: 'Success', description: 'Organization created successfully' });
                    setCreateModalOpen(false);
                    setSelectedOrgId(data.organization.id);
                    fetchOrganizationsList();
                    window.dispatchEvent(new Event('orgs-refresh'));
                  } else {
                    toast({ title: 'Error', description: data.error || 'Failed to create', variant: 'destructive' });
                  }
                } catch {
                  toast({ title: 'Error', description: 'Failed to create organization', variant: 'destructive' });
                } finally {
                  setCreateLoading(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
            >
              {createLoading ? 'Creating…' : 'Create Organization'}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  // If user does not have any organization selected or owns none
  if (organizations.length === 0 && !selectedOrgId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-4 shadow-sm">
          <Building2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Organizations & Teams</h2>
        <p className="text-sm text-muted-foreground max-w-md mt-2 leading-relaxed">
          Create an organization for your school, classroom, or family. Organizations grant plan access to all members with customizable seats and groups.
        </p>
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={() => {
              setCreateName('');
              setCreateType('school');
              setCreateSeats(10);
              setCreateTier('pro');
              setCreateModalOpen(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Organization
          </button>
          <a
            href="/pricing"
            className="px-5 py-2.5 rounded-xl border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-all"
          >
            View Plans
          </a>
        </div>

        {/* Create Organization Modal */}
        {renderCreateOrgModal()}
      </div>
    );
  }

  // Available tabs depending on organization type and owner role
  // "Family organizations only show Users and Settings."
  // "Administrators can do everything except billing and settings."
  const isFamily = orgDetail?.type === 'family';
  const tabs: Array<{ id: 'users' | 'groups' | 'both' | 'settings'; label: string; icon: any }> = isFamily
    ? [
        { id: 'users', label: 'Users', icon: Users },
        ...(isOwner ? [{ id: 'settings' as const, label: 'Settings', icon: Settings }] : []),
      ]
    : [
        { id: 'users', label: 'Users', icon: Users },
        { id: 'groups', label: 'Groups', icon: FolderKanban },
        { id: 'both', label: 'Both', icon: LayoutList },
        ...(isOwner ? [{ id: 'settings' as const, label: 'Settings', icon: Settings }] : []),
      ];

  const seatsPercentage = orgDetail ? Math.min(100, Math.round((orgDetail.currentSeats / orgDetail.maxSeats) * 100)) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
      {/* Header bar */}
      <header className="px-4 sm:px-6 py-3 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {organizations.length > 1 && (
            <select
              value={selectedOrgId || ''}
              onChange={e => setSelectedOrgId(parseInt(e.target.value))}
              className="text-xs bg-muted border border-border rounded-lg px-2.5 py-1.5 font-bold text-foreground outline-none cursor-pointer"
            >
              {organizations.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.role})
                </option>
              ))}
            </select>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-foreground truncate">{orgDetail?.name || 'Organization'}</h1>
              <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {orgDetail?.tier || 'Pro'}
              </span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                {orgDetail?.type}
              </span>
            </div>
          </div>
        </div>

        {/* Seat Usage Bar & Create Button */}
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <span>{orgDetail?.currentSeats}</span>
              <span className="text-muted-foreground">/</span>
              <span>{orgDetail?.maxSeats} seats</span>
            </div>
            <div className="w-28 h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  seatsPercentage >= 100 ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${seatsPercentage}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => {
              setCreateName('');
              setCreateType('school');
              setCreateSeats(10);
              setCreateTier('pro');
              setCreateModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground font-semibold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Org</span>
          </button>
        </div>
      </header>

      {/* Tabs navigation */}
      <div className="px-4 sm:px-6 border-b border-border bg-card flex items-center gap-1 overflow-x-auto flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`org-tab-${tab.id}`}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
        {detailLoading ? (
          <div className="flex justify-center py-16">
            <span className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ================= USERS TAB ================= */}
            {activeTab === 'users' && (
              <div className="space-y-4 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search by name, email, group, sub-group, or last active…"
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-card text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">{filteredMembers.length}</span> / {members.length} members
                  </div>
                </div>

                {/* Privacy Guarantee Note */}
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/80 flex items-center gap-3 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>
                    Privacy protected: Organization administrators only see membership and group status. Personal tasks, notes, habits and chat activity are never shared.
                  </span>
                </div>

                {/* Members Table */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="py-3 px-4">Name</th>
                          <th className="py-3 px-4">Email</th>
                          {!isFamily && <th className="py-3 px-4">Group</th>}
                          {!isFamily && <th className="py-3 px-4">Sub-group</th>}
                          <th className="py-3 px-4">Last Active</th>
                          {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-xs">
                        {filteredMembers.length === 0 ? (
                          <tr>
                            <td colSpan={isFamily ? (isAdmin ? 4 : 3) : (isAdmin ? 6 : 5)} className="py-8 text-center text-muted-foreground">
                              No members match your search.
                            </td>
                          </tr>
                        ) : (
                          filteredMembers.map(member => (
                            <tr key={member.id} className="hover:bg-muted/20 transition-colors">
                              <td className="py-3.5 px-4 font-bold text-foreground whitespace-nowrap">
                                {member.name}
                              </td>
                              <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                                {member.email}
                              </td>
                              {!isFamily && (
                                <td className="py-3.5 px-4">
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {member.groups && member.groups.length > 0 ? (
                                      member.groups.map(g => (
                                        <span key={g} className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-semibold text-foreground">
                                          {g}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-muted-foreground italic text-[11px]">Unassigned</span>
                                    )}
                                  </div>
                                </td>
                              )}
                              {!isFamily && (
                                <td className="py-3.5 px-4">
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {member.subGroups && member.subGroups.length > 0 ? (
                                      member.subGroups.map(sg => (
                                        <span key={sg} className="px-2 py-0.5 rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                                          {sg}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-muted-foreground text-[11px]">—</span>
                                    )}
                                  </div>
                                </td>
                              )}
                              <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                                {formatLastActive(member.lastActiveAt)}
                              </td>
                              {isAdmin && (
                                <td className="py-3.5 px-4 text-right">
                                  {!member.isOwner && (
                                    <button
                                      onClick={() => handleKickMember(member.id, member.name)}
                                      title="Kick member"
                                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    >
                                      <UserX className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ================= GROUPS TAB ================= */}
            {activeTab === 'groups' && !isFamily && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-foreground">Groups & Sub-groups</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Organize members into groups (e.g. Year 9) and sub-groups (e.g. Class A, Class B). Max 1 sub-group per group per member.
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={openCreateGroupModal}
                      className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1.5 shadow-xs hover:bg-primary/90 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Group
                    </button>
                  )}
                </div>

                {groups.length === 0 ? (
                  <div className="p-8 text-center bg-card border border-border rounded-2xl">
                    <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                      <FolderKanban className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">No groups created yet</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                      Create your first group (e.g. Year 9 or Department) and generate join codes for members.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groups.map(group => (
                      <div key={group.id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
                        {/* Parent Group Header */}
                        <div className="p-4 sm:p-5 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span
                                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: group.color }}
                              />
                              {renderGroupIcon(group.icon, 'folder')}
                              <h3 className="text-base font-bold text-foreground">{group.name}</h3>
                              <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground border border-border">
                                {group.memberCount} members
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground pl-6">
                              <span>Uses: {group.codeUses}{group.codeMaxUses != null ? ` / ${group.codeMaxUses}` : ' (unlimited)'}</span>
                              {group.codeExpiresAt && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Expires {new Date(group.codeExpiresAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Group Join Code & Controls */}
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-xs">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Code:</span>
                              <span className="font-mono font-bold tracking-wider text-foreground">{group.joinCode}</span>
                              <button
                                onClick={() => copyToClipboard(group.joinCode)}
                                className="p-1 hover:text-primary transition-colors"
                                title="Copy code"
                              >
                                {copiedCode === group.joinCode ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleToggleCodeActive(group.id, group.codeActive)}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                                    group.codeActive
                                      ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                                      : 'bg-muted text-muted-foreground border border-border'
                                  }`}
                                  title="Toggle active"
                                >
                                  {group.codeActive ? 'Active' : 'Paused'}
                                </button>
                                <button
                                  onClick={() => handleRegenerateCode(group.id)}
                                  className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                                  title="Regenerate code"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => openEditGroupModal(group, 'edit-group')}
                                  className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                                  title="Edit group"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteGroup(group.id, group.name)}
                                  className="p-1.5 rounded-lg border border-destructive/20 hover:bg-destructive/10 text-destructive"
                                  title="Delete group"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Sub-groups */}
                        <div className="p-4 sm:p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Sub-groups</p>
                            {isAdmin && (
                              <button
                                onClick={() => openCreateSubGroupModal(group)}
                                className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add Sub-group
                              </button>
                            )}
                          </div>

                          {group.subGroups.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-2">
                              No sub-groups yet. Add sub-groups like "Class A" or "Class B" so members get assigned automatically upon joining.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {group.subGroups.map(subGroup => (
                                <div
                                  key={subGroup.id}
                                  className="p-3.5 rounded-xl border border-border bg-muted/30 flex flex-col gap-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: subGroup.color }}
                                      />
                                      {renderGroupIcon(subGroup.icon, 'layers')}
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-foreground truncate">{subGroup.name}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                          {subGroup.memberCount} members · Uses: {subGroup.codeUses}{subGroup.codeMaxUses != null ? `/${subGroup.codeMaxUses}` : ''}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() => copyToClipboard(subGroup.joinCode)}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-card text-[11px] font-mono font-bold hover:text-primary transition-colors"
                                        title="Copy sub-group code (auto-assigns to both sub-group and parent)"
                                      >
                                        {copiedCode === subGroup.joinCode ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                        {subGroup.joinCode}
                                      </button>

                                      {isAdmin && (
                                        <>
                                          <button
                                            onClick={() => handleToggleCodeActive(subGroup.id, subGroup.codeActive)}
                                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                              subGroup.codeActive
                                                ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                                                : 'bg-muted text-muted-foreground border border-border'
                                            }`}
                                          >
                                            {subGroup.codeActive ? 'On' : 'Off'}
                                          </button>
                                          <button
                                            onClick={() => handleRegenerateCode(subGroup.id)}
                                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                                            title="Regenerate code"
                                          >
                                            <RefreshCw className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => openEditGroupModal(subGroup, 'edit-subgroup')}
                                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                                            title="Edit sub-group"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteGroup(subGroup.id, subGroup.name)}
                                            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            title="Delete sub-group"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {subGroup.codeExpiresAt && (
                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 pl-5">
                                      <Clock className="w-3 h-3" />
                                      Expires {new Date(subGroup.codeExpiresAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ================= BOTH TAB ================= */}
            {activeTab === 'both' && !isFamily && (
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-foreground">Hierarchy & Assignments</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Drag and drop users across sub-groups, directly into a parent group, or back to Unassigned.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 p-0.5 rounded-xl border border-border bg-muted/40">
                    <button
                      onClick={() => setBothViewMode('list')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        bothViewMode === 'list' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <LayoutList className="w-3.5 h-3.5" />
                      List View
                    </button>
                    <button
                      onClick={() => setBothViewMode('board')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        bothViewMode === 'board' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Kanban className="w-3.5 h-3.5" />
                      Board View
                    </button>
                  </div>
                </div>

                {/* Unassigned Section Always at Top (Drop Target to Unassign) */}
                <div
                  onDragOver={e => handleDragOver(e, 'unassigned-top')}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropOnUnassigned}
                  className={`rounded-2xl border border-dashed p-4 space-y-3 transition-colors ${
                    dragOverTargetId === 'unassigned-top'
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                      : 'border-border bg-card/60'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Unassigned Members ({unassignedMembers.length})
                      </h4>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Drag into a group/sub-group below, or drop here to unassign
                    </span>
                  </div>

                  {unassignedMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No unassigned members. Drop a user here to remove them from their current group.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {unassignedMembers.map(m => (
                        <div
                          key={m.id}
                          draggable={isAdmin}
                          onDragStart={e => handleDragStart(e, m.id, null)}
                          className="px-3 py-2 rounded-xl border border-border bg-card flex items-center gap-2 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all shadow-xs"
                        >
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                            {m.name.slice(0, 1).toUpperCase()}
                          </div>
                          <span className="text-xs font-semibold text-foreground">{m.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* --- LIST VIEW --- */}
                {bothViewMode === 'list' && (
                  <div className="space-y-6">
                    {groups.map(group => {
                      const isGroupCollapsed = Boolean(collapsedGroups[group.id]);
                      const isDirectOver = dragOverTargetId === `list-direct-${group.id}`;
                      return (
                        <div key={group.id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
                          {/* Group Header with Expand/Collapse & Edit */}
                          <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                                title={isGroupCollapsed ? 'Expand group' : 'Collapse group'}
                              >
                                {isGroupCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                              {renderGroupIcon(group.icon, 'folder')}
                              <h3 className="text-sm font-bold text-foreground truncate">{group.name}</h3>
                              <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground border border-border">
                                {group.memberCount} members
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[11px] text-muted-foreground font-mono font-bold hidden sm:inline">Code: {group.joinCode}</span>
                              {isAdmin && (
                                <button
                                  onClick={() => openEditGroupModal(group, 'edit-group')}
                                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                  title="Edit group"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {!isGroupCollapsed && (
                            <>
                              {/* Direct Members ABOVE Sub-groups (Drop Zone for Parent Group Only) */}
                              <div
                                onDragOver={e => handleDragOver(e, `list-direct-${group.id}`)}
                                onDragLeave={handleDragLeave}
                                onDrop={e => handleDropOnSubGroup(e, group.id, null)}
                                className={`p-4 border-b border-border/50 space-y-2 transition-colors ${
                                  isDirectOver ? 'bg-primary/10 ring-2 ring-primary ring-inset' : 'bg-muted/10'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                    Direct Group Members ({group.directMemberIds.length})
                                  </p>
                                  <span className="text-[10px] text-muted-foreground">No sub-group · Drop here to assign directly</span>
                                </div>
                                {group.directMemberIds.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic">No direct members. Drop here to assign directly to {group.name}.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {group.directMemberIds.map(uid => {
                                      const m = members.find(u => u.id === uid);
                                      if (!m) return null;
                                      return (
                                        <div
                                          key={m.id}
                                          draggable={isAdmin}
                                          onDragStart={e => handleDragStart(e, m.id, group.id)}
                                          className="px-2.5 py-1.5 rounded-lg border border-border bg-card flex items-center gap-1.5 text-xs cursor-grab hover:border-primary/50"
                                        >
                                          <GripVertical className="w-3 h-3 text-muted-foreground" />
                                          <span className="font-medium text-foreground">{m.name}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Sub-groups list with users */}
                              <div className="divide-y divide-border">
                                {group.subGroups.map(subGroup => {
                                  const isCollapsed = Boolean(collapsedSubGroups[subGroup.id]);
                                  const isOver = dragOverTargetId === `list-sub-${subGroup.id}`;

                                  return (
                                    <div
                                      key={subGroup.id}
                                      onDragOver={e => handleDragOver(e, `list-sub-${subGroup.id}`)}
                                      onDragLeave={handleDragLeave}
                                      onDrop={e => handleDropOnSubGroup(e, group.id, subGroup.id)}
                                      className={`transition-colors ${isOver ? 'bg-primary/10 ring-2 ring-primary ring-inset' : ''}`}
                                    >
                                      <div className="p-3.5 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <button
                                            onClick={() =>
                                              setCollapsedSubGroups(prev => ({
                                                ...prev,
                                                [subGroup.id]: !prev[subGroup.id],
                                              }))
                                            }
                                            className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                                          >
                                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                          </button>
                                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: subGroup.color }} />
                                          {renderGroupIcon(subGroup.icon, 'layers')}
                                          <button
                                            onClick={() => isAdmin && openEditGroupModal(subGroup, 'edit-subgroup')}
                                            className="text-xs font-bold text-foreground hover:underline text-left truncate"
                                          >
                                            {subGroup.name}
                                          </button>
                                          <span className="text-[10px] text-muted-foreground font-semibold">
                                            ({subGroup.memberCount} users)
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground font-mono">Code: {subGroup.joinCode}</span>
                                      </div>

                                      {/* Expanded Users inside Sub-group */}
                                      {!isCollapsed && (
                                        <div className="px-10 pb-3.5 pt-1">
                                          {subGroup.memberIds.length === 0 ? (
                                            <p className="text-xs text-muted-foreground italic py-1">No users assigned. Drop users here.</p>
                                          ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                              {subGroup.memberIds.map(uid => {
                                                const userItem = members.find(m => m.id === uid);
                                                if (!userItem) return null;
                                                return (
                                                  <div
                                                    key={userItem.id}
                                                    draggable={isAdmin}
                                                    onDragStart={e => handleDragStart(e, userItem.id, group.id)}
                                                    className="p-2.5 rounded-xl border border-border bg-card flex items-center justify-between gap-2 shadow-2xs hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all"
                                                  >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                      <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                                        {userItem.name.slice(0, 1).toUpperCase()}
                                                      </div>
                                                      <div className="min-w-0">
                                                        <p className="text-xs font-bold text-foreground truncate">{userItem.name}</p>
                                                        <p className="text-[10px] text-muted-foreground truncate">{userItem.email}</p>
                                                      </div>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* --- BOARD VIEW --- */}
                {bothViewMode === 'board' && (
                  <div className="space-y-8">
                    {groups.map(group => {
                      const isGroupCollapsed = Boolean(collapsedGroups[group.id]);
                      const isDirectOver = dragOverTargetId === `board-direct-${group.id}`;
                      return (
                        <div key={group.id} className="space-y-3">
                          <div className="flex items-center justify-between border-b border-border pb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                                title={isGroupCollapsed ? 'Expand group' : 'Collapse group'}
                              >
                                {isGroupCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                              {renderGroupIcon(group.icon, 'folder')}
                              <h3 className="text-sm font-bold text-foreground truncate">{group.name}</h3>
                              <span className="text-xs text-muted-foreground">({group.memberCount} members)</span>
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => openEditGroupModal(group, 'edit-group')}
                                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                title="Edit group"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {!isGroupCollapsed && (
                            <div className="flex gap-4 overflow-x-auto pb-4 items-start">
                              {/* Direct Group Members Column (Before Sub-groups) */}
                              <div
                                onDragOver={e => handleDragOver(e, `board-direct-${group.id}`)}
                                onDragLeave={handleDragLeave}
                                onDrop={e => handleDropOnSubGroup(e, group.id, null)}
                                className={`w-72 flex-shrink-0 rounded-2xl border border-dashed border-border bg-muted/20 flex flex-col max-h-[600px] transition-all shadow-xs ${
                                  isDirectOver ? 'ring-2 ring-primary bg-primary/10 scale-[1.01]' : ''
                                }`}
                              >
                                <div className="p-3.5 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                                  <span className="text-xs font-bold text-foreground truncate">Direct Members (No Sub-group)</span>
                                  <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                    {group.directMemberIds.length}
                                  </span>
                                </div>
                                <div className="p-3 overflow-y-auto space-y-2 flex-1">
                                  {group.directMemberIds.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-muted-foreground italic border border-dashed border-border rounded-xl">
                                      Drop here for direct group assignment
                                    </div>
                                  ) : (
                                    group.directMemberIds.map(uid => {
                                      const u = members.find(m => m.id === uid);
                                      if (!u) return null;
                                      return (
                                        <div
                                          key={u.id}
                                          draggable={isAdmin}
                                          onDragStart={e => handleDragStart(e, u.id, group.id)}
                                          className="p-3 rounded-xl border border-border bg-card shadow-2xs hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all space-y-1"
                                        >
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                                {u.name.slice(0, 1).toUpperCase()}
                                              </div>
                                              <p className="text-xs font-bold text-foreground truncate">{u.name}</p>
                                            </div>
                                            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                                          </div>
                                          <p className="text-[11px] text-muted-foreground truncate pl-8">{u.email}</p>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>

                              {/* Sub-group Columns */}
                              {group.subGroups.map(subGroup => {
                                const isOver = dragOverTargetId === `board-sub-${subGroup.id}`;
                                const isSubCollapsed = Boolean(collapsedSubGroups[subGroup.id]);

                                return (
                                  <div
                                    key={subGroup.id}
                                    onDragOver={e => handleDragOver(e, `board-sub-${subGroup.id}`)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={e => handleDropOnSubGroup(e, group.id, subGroup.id)}
                                    className={`w-72 flex-shrink-0 rounded-2xl border border-border bg-muted/20 flex flex-col max-h-[600px] transition-all shadow-xs ${
                                      isOver ? 'ring-2 ring-primary bg-primary/10 scale-[1.01]' : ''
                                    }`}
                                  >
                                    {/* Column Header with Collapse + Edit */}
                                    <div className="p-3.5 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <button
                                          onClick={() =>
                                            setCollapsedSubGroups(prev => ({
                                              ...prev,
                                              [subGroup.id]: !prev[subGroup.id],
                                            }))
                                          }
                                          className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                        >
                                          {isSubCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </button>
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: subGroup.color }} />
                                        {renderGroupIcon(subGroup.icon, 'layers')}
                                        <span className="text-xs font-bold text-foreground truncate">{subGroup.name}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                          {subGroup.memberCount}
                                        </span>
                                        {isAdmin && (
                                          <button
                                            onClick={() => openEditGroupModal(subGroup, 'edit-subgroup')}
                                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                                            title="Edit sub-group"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* User Cards in Column */}
                                    {!isSubCollapsed && (
                                      <div className="p-3 overflow-y-auto space-y-2 flex-1">
                                        {subGroup.memberIds.length === 0 ? (
                                          <div className="p-6 text-center text-xs text-muted-foreground italic border border-dashed border-border rounded-xl">
                                            Drop users here
                                          </div>
                                        ) : (
                                          subGroup.memberIds.map(uid => {
                                            const u = members.find(m => m.id === uid);
                                            if (!u) return null;
                                            return (
                                              <div
                                                key={u.id}
                                                draggable={isAdmin}
                                                onDragStart={e => handleDragStart(e, u.id, group.id)}
                                                className="p-3 rounded-xl border border-border bg-card shadow-2xs hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all space-y-1"
                                              >
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                                      {u.name.slice(0, 1).toUpperCase()}
                                                    </div>
                                                    <p className="text-xs font-bold text-foreground truncate">{u.name}</p>
                                                  </div>
                                                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                                                </div>
                                                <p className="text-[11px] text-muted-foreground truncate pl-8">{u.email}</p>
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ================= SETTINGS TAB (OWNER ONLY) ================= */}
            {activeTab === 'settings' && isOwner && (
              <div className="space-y-6 max-w-2xl mx-auto">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-bold text-foreground">Organization Settings</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Manage organization name, plan tier, seat capacity, billing, administrators, and ownership.
                  </p>
                </div>

                {/* Organization Details & Seats Form */}
                <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">General Information</h3>

                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase">Organization Name</label>
                    <input
                      type="text"
                      value={settingsName}
                      onChange={e => setSettingsName(e.target.value)}
                      className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {!isFamily && (
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase">Plan Tier</label>
                      <div className="grid grid-cols-2 gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setSettingsTier('premium')}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            settingsTier === 'premium' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          <p className="text-xs font-bold text-foreground">Premium</p>
                          <p className="text-[11px] text-muted-foreground">Core workspace + uploads + insights</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettingsTier('pro')}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            settingsTier === 'pro' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          <p className="text-xs font-bold text-foreground">Pro</p>
                          <p className="text-[11px] text-muted-foreground">Unlimited AI features + PDF exports</p>
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase">Seat Capacity</label>
                    <input
                      type="number"
                      min={orgDetail?.currentSeats || 1}
                      disabled={isFamily}
                      value={isFamily ? 5 : settingsSeats}
                      onChange={e => setSettingsSeats(Math.max(orgDetail?.currentSeats || 1, parseInt(e.target.value) || 1))}
                      className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Current active members: <span className="font-bold text-foreground">{orgDetail?.currentSeats}</span>.
                      {isFamily ? ' Family organizations are fixed at 5 seats.' : ' You cannot reduce seats below the current member count.'}
                    </p>
                  </div>

                  {settingsError && (
                    <p className="text-xs text-destructive font-medium">{settingsError}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={handleSaveSettings}
                      disabled={settingsSaving}
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all disabled:opacity-50"
                    >
                      {settingsSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>

                {/* Billing & Plan Upgrade */}
                <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Billing & Plan Renewal</h3>
                    </div>
                    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {orgDetail?.status || 'active'}
                    </span>
                  </div>

                  {isFamily ? (
                    <p className="text-xs text-muted-foreground">
                      Family Pro Plan (5 seats fixed): <span className="font-bold text-foreground">$14.99/month</span> or <span className="font-bold text-foreground">$143.90/year (20% off)</span>.
                    </p>
                  ) : (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        School Volume Rate for <span className="font-bold text-foreground">{settingsSeats} seats</span>:{' '}
                        <span className="font-bold text-foreground">${getSchoolPerSeatMonthlyRate(settingsSeats).toFixed(2)}/seat/mo</span>
                      </p>
                      <p>
                        Total:{' '}
                        <span className="font-bold text-foreground">
                          {settingsBillingPeriod === 'yearly'
                            ? `$${(settingsSeats * getSchoolPerSeatMonthlyRate(settingsSeats) * 12 * 0.8).toFixed(2)}/year (20% off)`
                            : `$${(settingsSeats * getSchoolPerSeatMonthlyRate(settingsSeats)).toFixed(2)}/month`}
                        </span>
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSettingsBillingPeriod('monthly')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                        settingsBillingPeriod === 'monthly' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsBillingPeriod('yearly')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                        settingsBillingPeriod === 'yearly' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                      }`}
                    >
                      Yearly (Save 20%)
                    </button>
                  </div>

                  <button
                    onClick={handleUpgradeBilling}
                    disabled={billingLoading}
                    className="px-4 py-2 rounded-xl bg-foreground text-background font-bold text-xs hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {billingLoading ? 'Redirecting to PayPal…' : 'Checkout Plan & Seats via PayPal'}
                  </button>
                </div>

                {/* Administrators Management */}
                {isOwner && (
                  <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Administrators</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Administrators can create groups, manage join codes, and kick members. Only owners can access billing and settings.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {members
                        .filter(m => m.isAdmin)
                        .map(admin => (
                          <div key={admin.id} className="p-3 rounded-xl border border-border bg-muted/30 flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                              <span className="text-xs font-bold text-foreground truncate">{admin.name}</span>
                              <span className="text-[11px] text-muted-foreground truncate">({admin.email})</span>
                              {admin.isOwner && (
                                <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                  Owner
                                </span>
                              )}
                            </div>
                            {!admin.isOwner && (
                              <button
                                onClick={() => handleRemoveAdmin(admin.id)}
                                className="text-xs text-destructive hover:underline font-semibold"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                    </div>

                    {/* Add Admin Selector */}
                    <div className="flex items-center gap-2 pt-2">
                      <select
                        value={newAdminUserId}
                        onChange={e => setNewAdminUserId(e.target.value ? parseInt(e.target.value) : '')}
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground outline-none cursor-pointer"
                      >
                        <option value="">Select a member to make administrator…</option>
                        {members
                          .filter(m => !m.isAdmin)
                          .map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.email})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={handleAddAdmin}
                        disabled={!newAdminUserId}
                        className="px-4 py-2 rounded-xl bg-secondary text-secondary-foreground font-semibold text-xs hover:bg-secondary/80 transition-colors disabled:opacity-50"
                      >
                        Add Admin
                      </button>
                    </div>
                  </div>
                )}

                {/* Transfer Ownership */}
                {isOwner && (
                  <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Transfer Ownership</h3>
                    <p className="text-xs text-muted-foreground">
                      Transfer full ownership and billing control to another member of this organization. You will remain an administrator.
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        value={transferOwnerUserId}
                        onChange={e => setTransferOwnerUserId(e.target.value ? parseInt(e.target.value) : '')}
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground outline-none cursor-pointer"
                      >
                        <option value="">Select new owner…</option>
                        {members
                          .filter(m => !m.isOwner)
                          .map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.email})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={handleTransferOwnership}
                        disabled={!transferOwnerUserId}
                        className="px-4 py-2 rounded-xl border border-destructive/30 text-destructive font-semibold text-xs hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      >
                        Transfer
                      </button>
                    </div>
                  </div>
                )}

                {/* Danger Zone: Delete Organization */}
                {isOwner && (
                  <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-3">
                    <h3 className="text-xs font-bold text-destructive uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Danger Zone
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Permanently delete this organization, along with all its groups, codes, and member seat allocations.
                    </p>
                    <button
                      onClick={() => {
                        if (confirm(`Permanently delete "${orgDetail?.name}"? All members will immediately lose access to this organization's plan.`)) {
                          handleDeleteOrg();
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs hover:bg-destructive/90 transition-all shadow-xs"
                    >
                      Delete Organization
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Column Style Popup for Group & Sub-group */}
      {groupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-foreground">
                {groupModalMode === 'create-group'
                  ? 'Add Group'
                  : groupModalMode === 'create-subgroup'
                  ? 'Add Sub-group'
                  : groupModalMode === 'edit-group'
                  ? 'Edit Group'
                  : 'Edit Sub-group'}
              </span>
              <button onClick={() => setGroupModalOpen(false)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Name</label>
                <input
                  autoFocus
                  value={groupEditName}
                  onChange={e => setGroupEditName(e.target.value)}
                  placeholder="e.g. Year 9 or Class B"
                  className="w-full bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLUMN_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setGroupEditColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${
                        groupEditColor === c ? 'border-foreground ring-2 ring-primary/30' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Icon</label>
                <div className="grid grid-cols-7 gap-1.5 mb-2">
                  {GROUP_ICON_OPTIONS.map(opt => {
                    const IconComp = opt.icon;
                    const selected = groupEditIcon.toLowerCase() === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setGroupEditIcon(opt.key)}
                        title={opt.label}
                        className={`p-2 rounded-xl border flex items-center justify-center transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
                <input
                  value={groupEditIcon}
                  onChange={e => setGroupEditIcon(e.target.value)}
                  placeholder="Icon key or symbol"
                  className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              {/* Optional Join Code Expiry, Max Uses & Status Controls */}
              <div className="pt-2 border-t border-border space-y-3">
                <label className="text-[10px] font-bold text-muted-foreground uppercase block">Join Code Controls</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Code Expiry (optional)</label>
                    <input
                      type="datetime-local"
                      value={groupEditCodeExpiresAt}
                      onChange={e => setGroupEditCodeExpiresAt(e.target.value)}
                      className="w-full bg-muted/30 border border-border rounded-xl px-2.5 py-2 text-xs text-foreground outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Max Uses (optional)</label>
                    <input
                      type="number"
                      min={1}
                      value={groupEditCodeMaxUses}
                      onChange={e => setGroupEditCodeMaxUses(e.target.value)}
                      placeholder="Unlimited"
                      className="w-full bg-muted/30 border border-border rounded-xl px-2.5 py-2 text-xs text-foreground outline-none"
                    />
                  </div>
                </div>

                {(groupModalMode === 'edit-group' || groupModalMode === 'edit-subgroup') && targetEditGroupId && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setGroupEditCodeActive(prev => !prev)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        groupEditCodeActive
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      Join Code: {groupEditCodeActive ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerateCode(targetEditGroupId)}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate Code
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGroupModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-border text-xs font-bold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveGroupModal}
                  disabled={groupModalLoading || !groupEditName.trim()}
                  className="px-5 py-2.5 bg-foreground text-background text-sm font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {groupModalLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {renderCreateOrgModal()}
    </div>
  );
};

export default Organizations;

