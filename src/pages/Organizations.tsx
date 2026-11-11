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
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { toast } from '@/hooks/use-toast';

const COLUMN_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6',
  '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e',
];

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

  // Expand / Collapse state for sub-groups in Both Tab list view
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
  const [groupEditIcon, setGroupEditIcon] = useState('📁');
  const [groupModalLoading, setGroupModalLoading] = useState(false);

  // Drag and Drop State
  const [draggedUserId, setDraggedUserId] = useState<number | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);

  // Settings tab form state
  const [settingsName, setSettingsName] = useState('');
  const [settingsSeats, setSettingsSeats] = useState(1);
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
        if (list.length > 0 && selectedOrgId === null && !searchParams.get('id')) {
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
        setIsOwner(Boolean(data.isOwner));
        setIsAdmin(Boolean(data.isAdmin));
        setSettingsName(data.organization?.name || '');
        setSettingsSeats(data.organization?.maxSeats || 1);

        // Adjust tab if family org
        if (data.organization?.type === 'family' && (activeTab === 'groups' || activeTab === 'both')) {
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

  useEffect(() => {
    if (selectedOrgId !== null) {
      setSearchParams({ id: String(selectedOrgId) }, { replace: true });
      fetchOrgDetails(selectedOrgId);
    }
  }, [selectedOrgId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    toast({ title: 'Copied code!', description: `${text} copied to clipboard` });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Filtered members for Users tab
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(
      m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  // Handle Drag & Drop of users between sub-groups
  const handleDragStart = (e: React.DragEvent, userId: number) => {
    e.dataTransfer.setData('application/x-org-member', String(userId));
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
        toast({ title: 'Moved member', description: 'Member assignment updated' });
        fetchOrgDetails(selectedOrgId);
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to move member', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to assign member', variant: 'destructive' });
    } finally {
      setDraggedUserId(null);
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
  const handleSaveGroupModal = async () => {
    if (!selectedOrgId || !groupEditName.trim()) return;
    setGroupModalLoading(true);
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
          }),
        });
        if (res.ok) {
          toast({ title: 'Group created', description: `${groupEditName} added successfully` });
          setGroupModalOpen(false);
          fetchOrgDetails(selectedOrgId);
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
          }),
        });
        if (res.ok) {
          toast({ title: 'Sub-group created', description: `${groupEditName} added successfully` });
          setGroupModalOpen(false);
          fetchOrgDetails(selectedOrgId);
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
          }),
        });
        if (res.ok) {
          toast({ title: 'Updated', description: 'Group updated successfully' });
          setGroupModalOpen(false);
          fetchOrgDetails(selectedOrgId);
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
      const res = await fetch(`/api/organizations/${selectedOrgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: settingsName.trim(),
          maxSeats: settingsSeats,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Saved', description: 'Organization settings saved successfully.' });
        fetchOrgDetails(selectedOrgId);
        fetchOrganizationsList();
      } else {
        setSettingsError(data.error || 'Failed to save settings');
      }
    } catch {
      setSettingsError('Failed to save settings');
    } finally {
      setSettingsSaving(false);
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
        fetchOrgDetails(selectedOrgId);
        fetchOrganizationsList();
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
        {createModalOpen && (
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
                  <label className="text-xs font-bold text-muted-foreground uppercase">Number of Seats</label>
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
        )}
      </div>
    );
  }

  // Available tabs depending on organization type
  // "Family organizations only show Users and Settings."
  const isFamily = orgDetail?.type === 'family';
  const tabs: Array<{ id: 'users' | 'groups' | 'both' | 'settings'; label: string; icon: any }> = isFamily
    ? [
        { id: 'users', label: 'Users', icon: Users },
        { id: 'settings', label: 'Settings', icon: Settings },
      ]
    : [
        { id: 'users', label: 'Users', icon: Users },
        { id: 'groups', label: 'Groups', icon: FolderKanban },
        { id: 'both', label: 'Both', icon: LayoutList },
        { id: 'settings', label: 'Settings', icon: Settings },
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
                      placeholder="Search members by name or email…"
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-card text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">{members.length}</span> total members
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
                          <th className="py-3 px-4">Member</th>
                          <th className="py-3 px-4">Role</th>
                          {!isFamily && <th className="py-3 px-4">Groups & Sub-groups</th>}
                          <th className="py-3 px-4">Joined</th>
                          {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-xs">
                        {filteredMembers.map(member => (
                          <tr key={member.id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-xs">
                                  {member.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-foreground truncate">{member.name}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  member.isOwner
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                    : member.isAdmin
                                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                    : 'bg-muted text-muted-foreground border border-border'
                                }`}
                              >
                                {member.isOwner && <Crown className="w-2.5 h-2.5" />}
                                {member.isOwner ? 'Owner' : member.isAdmin ? 'Admin' : 'Member'}
                              </span>
                            </td>
                            {!isFamily && (
                              <td className="py-3.5 px-4">
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {member.groups && member.groups.length > 0 ? (
                                    member.groups.map(g => (
                                      <span key={g} className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-semibold text-foreground">
                                        {g}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-muted-foreground italic text-[11px]">Unassigned</span>
                                  )}
                                  {member.subGroups && member.subGroups.length > 0 && (
                                    member.subGroups.map(sg => (
                                      <span key={sg} className="px-2 py-0.5 rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                                        ↳ {sg}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </td>
                            )}
                            <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                              {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '—'}
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ================= GROUPS TAB ================= */}
            {activeTab === 'groups' && !isFamily && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-foreground">Groups & Sub-groups</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Organize your members into groups (e.g. Year 9) and sub-groups (e.g. Class A, Class B).
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setGroupModalMode('create-group');
                        setGroupEditName('');
                        setGroupEditColor('#3b82f6');
                        setGroupEditIcon('📁');
                        setGroupModalOpen(true);
                      }}
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
                          <div className="flex items-center gap-3">
                            <span
                              className="w-4 h-4 rounded-full flex-shrink-0"
                              style={{ backgroundColor: group.color }}
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-base">{group.icon || '📁'}</span>
                              <h3 className="text-base font-bold text-foreground">{group.name}</h3>
                              <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground border border-border">
                                {group.memberCount} members
                              </span>
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
                                  onClick={() => {
                                    setGroupModalMode('edit-group');
                                    setTargetEditGroupId(group.id);
                                    setGroupEditName(group.name);
                                    setGroupEditColor(group.color);
                                    setGroupEditIcon(group.icon || '📁');
                                    setGroupModalOpen(true);
                                  }}
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
                                onClick={() => {
                                  setGroupModalMode('create-subgroup');
                                  setTargetParentGroupId(group.id);
                                  setGroupEditName('');
                                  setGroupEditColor(group.color);
                                  setGroupEditIcon('🏷️');
                                  setGroupModalOpen(true);
                                }}
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
                                  className="p-3.5 rounded-xl border border-border bg-muted/30 flex items-center justify-between gap-3"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span
                                      className="w-3 h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: subGroup.color }}
                                    />
                                    <span className="text-sm">{subGroup.icon || '🏷️'}</span>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-foreground truncate">{subGroup.name}</p>
                                      <p className="text-[10px] text-muted-foreground">{subGroup.memberCount} members</p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-shrink-0">
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
                                          onClick={() => {
                                            setGroupModalMode('edit-subgroup');
                                            setTargetEditGroupId(subGroup.id);
                                            setGroupEditName(subGroup.name);
                                            setGroupEditColor(subGroup.color);
                                            setGroupEditIcon(subGroup.icon || '🏷️');
                                            setGroupModalOpen(true);
                                          }}
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
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-foreground">Hierarchy & Assignments</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      View all groups, sub-groups and assigned users. Drag and drop users between sub-groups.
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

                {/* Unassigned Section at Top */}
                {unassignedMembers.length > 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Unassigned Members ({unassignedMembers.length})
                        </h4>
                      </div>
                      <span className="text-[11px] text-muted-foreground">Drag into a sub-group below</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {unassignedMembers.map(m => (
                        <div
                          key={m.id}
                          draggable={isAdmin}
                          onDragStart={e => handleDragStart(e, m.id)}
                          className="px-3 py-2 rounded-xl border border-border bg-card flex items-center gap-2 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all shadow-xs"
                        >
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                            {m.name.slice(0, 1)}
                          </div>
                          <span className="text-xs font-semibold text-foreground">{m.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* --- LIST VIEW --- */}
                {bothViewMode === 'list' && (
                  <div className="space-y-6">
                    {groups.map(group => (
                      <div key={group.id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
                        {/* Group Header */}
                        <div
                          onClick={() => {
                            if (isAdmin) {
                              setGroupModalMode('edit-group');
                              setTargetEditGroupId(group.id);
                              setGroupEditName(group.name);
                              setGroupEditColor(group.color);
                              setGroupEditIcon(group.icon || '📁');
                              setGroupModalOpen(true);
                            }
                          }}
                          className={`p-4 border-b border-border bg-muted/20 flex items-center justify-between ${isAdmin ? 'cursor-pointer hover:bg-muted/40 transition-colors' : ''}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                            <span className="text-base">{group.icon || '📁'}</span>
                            <h3 className="text-sm font-bold text-foreground">{group.name}</h3>
                            <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground border border-border">
                              {group.memberCount} members
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono font-bold">Code: {group.joinCode}</span>
                        </div>

                        {/* Direct Members (in group but not sub-group) */}
                        {group.directMemberIds && group.directMemberIds.length > 0 && (
                          <div className="p-4 border-b border-border/50 bg-muted/10 space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Direct Group Members</p>
                            <div className="flex flex-wrap gap-2">
                              {group.directMemberIds.map(uid => {
                                const m = members.find(u => u.id === uid);
                                if (!m) return null;
                                return (
                                  <div
                                    key={m.id}
                                    draggable={isAdmin}
                                    onDragStart={e => handleDragStart(e, m.id)}
                                    className="px-2.5 py-1.5 rounded-lg border border-border bg-card flex items-center gap-1.5 text-xs cursor-grab hover:border-primary/50"
                                  >
                                    <GripVertical className="w-3 h-3 text-muted-foreground" />
                                    <span className="font-medium text-foreground">{m.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

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
                                    <span className="text-sm">{subGroup.icon || '🏷️'}</span>
                                    <button
                                      onClick={() => {
                                        if (isAdmin) {
                                          setGroupModalMode('edit-subgroup');
                                          setTargetEditGroupId(subGroup.id);
                                          setGroupEditName(subGroup.name);
                                          setGroupEditColor(subGroup.color);
                                          setGroupEditIcon(subGroup.icon || '🏷️');
                                          setGroupModalOpen(true);
                                        }
                                      }}
                                      className="text-xs font-bold text-foreground hover:underline text-left"
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
                                              onDragStart={e => handleDragStart(e, userItem.id)}
                                              className="p-2.5 rounded-xl border border-border bg-card flex items-center justify-between gap-2 shadow-2xs hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all"
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                                  {userItem.name.slice(0, 1)}
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
                      </div>
                    ))}
                  </div>
                )}

                {/* --- BOARD VIEW --- */}
                {bothViewMode === 'board' && (
                  <div className="space-y-8">
                    {groups.map(group => (
                      <div key={group.id} className="space-y-3">
                        <div className="flex items-center gap-2 border-b border-border pb-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                          <span className="text-base">{group.icon || '📁'}</span>
                          <h3 className="text-sm font-bold text-foreground">{group.name}</h3>
                          <span className="text-xs text-muted-foreground">({group.memberCount} members)</span>
                        </div>

                        {/* Columns container (sub-groups as columns) */}
                        <div className="flex gap-4 overflow-x-auto pb-4">
                          {group.subGroups.map(subGroup => {
                            const isOver = dragOverTargetId === `board-sub-${subGroup.id}`;

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
                                {/* Column Header */}
                                <div className="p-3.5 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subGroup.color }} />
                                    <span className="text-xs font-bold text-foreground truncate">{subGroup.name}</span>
                                  </div>
                                  <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                    {subGroup.memberCount}
                                  </span>
                                </div>

                                {/* User Cards in Column */}
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
                                          onDragStart={e => handleDragStart(e, u.id)}
                                          className="p-3 rounded-xl border border-border bg-card shadow-2xs hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all space-y-1"
                                        >
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center">
                                                {u.name.slice(0, 1)}
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
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ================= SETTINGS TAB ================= */}
            {activeTab === 'settings' && (
              <div className="space-y-6 max-w-2xl mx-auto">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-bold text-foreground">Organization Settings</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Manage plan tiers, seat capacity, administrators, and ownership.
                  </p>
                </div>

                {/* Organization Details & Seats Form */}
                <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">General Information</h3>

                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase">Organization Name</label>
                    <input
                      type="text"
                      disabled={!isOwner}
                      value={settingsName}
                      onChange={e => setSettingsName(e.target.value)}
                      className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase">Seat Capacity</label>
                    <input
                      type="number"
                      min={orgDetail?.currentSeats || 1}
                      disabled={!isOwner || isFamily}
                      value={settingsSeats}
                      onChange={e => setSettingsSeats(parseInt(e.target.value) || 1)}
                      className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Current active members: <span className="font-bold text-foreground">{orgDetail?.currentSeats}</span>.
                      You cannot reduce seats below the current member count.
                    </p>
                  </div>

                  {settingsError && (
                    <p className="text-xs text-destructive font-medium">{settingsError}</p>
                  )}

                  {isOwner && (
                    <button
                      onClick={handleSaveSettings}
                      disabled={settingsSaving}
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all disabled:opacity-50"
                    >
                      {settingsSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                  )}
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
          <div className="bg-card border border-border rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
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
                <div className="flex gap-2">
                  <input
                    value={groupEditIcon}
                    onChange={e => setGroupEditIcon(e.target.value)}
                    placeholder="e.g. 📁 or 🚀"
                    className="flex-1 bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                  <button
                    onClick={handleSaveGroupModal}
                    disabled={groupModalLoading || !groupEditName.trim()}
                    className="px-5 py-2.5 bg-foreground text-background text-sm font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organizations;

