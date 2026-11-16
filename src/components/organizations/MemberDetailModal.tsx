import React, { useEffect, useState } from 'react';
import {
  X,
  Crown,
  Shield,
  ShieldCheck,
  UserX,
  FolderInput,
  StickyNote,
  Plus,
  Trash2,
  Edit2,
  Check,
  Clock,
  Calendar,
  Mail,
  Loader2,
  UserMinus,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { OrgAdminSettings, OrgGroupItem, OrgMemberItem } from './orgTypes';

interface MemberNoteItem {
  id: number;
  content: string;
  authorId: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

interface MemberDetailModalProps {
  open: boolean;
  onClose: () => void;
  orgId: number;
  currentUserId?: number;
  isFamily: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isGroupAdmin: boolean;
  managedGroupIds: number[];
  adminGroupIds: number[];
  orgSettings: OrgAdminSettings;
  member: OrgMemberItem | null;
  groups: OrgGroupItem[];
  onUpdated: () => void;
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({
  open,
  onClose,
  orgId,
  currentUserId,
  isFamily,
  isOwner,
  isAdmin,
  isGroupAdmin,
  managedGroupIds,
  adminGroupIds,
  orgSettings,
  member,
  groups,
  onUpdated,
}) => {
  const [notes, setNotes] = useState<MemberNoteItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  const [moveGroupId, setMoveGroupId] = useState<number | ''>('');
  const [moveSubGroupId, setMoveSubGroupId] = useState<number | ''>('');
  const [actionBusy, setActionBusy] = useState(false);

  const canUseNotes =
    Boolean(member) && (isAdmin || (isGroupAdmin && orgSettings.groupAdminsCanUseNotes));

  useEffect(() => {
    if (!open || !member) return;
    setNewNoteText('');
    setEditingNoteId(null);
    setMoveGroupId('');
    setMoveSubGroupId('');
    if (canUseNotes) {
      loadNotes(member.id);
    } else {
      setNotes([]);
      setNotesError('');
    }
  }, [open, member?.id, orgId, canUseNotes]);

  const loadNotes = async (userId: number) => {
    setNotesLoading(true);
    setNotesError('');
    try {
      const res = await fetch(`/api/organizations/${orgId}/members/${userId}/notes`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setNotes(data.notes || []);
      } else {
        setNotesError(data.error || 'Unable to load member notes');
      }
    } catch {
      setNotesError('Unable to load member notes');
    } finally {
      setNotesLoading(false);
    }
  };

  if (!open || !member) return null;

  const managedSet = new Set(managedGroupIds);
  const directAdminSet = new Set(adminGroupIds);
  const memberAdminGroupIds = new Set(member.adminOfGroupIds || []);

  const canMoveMembers = isAdmin || (isGroupAdmin && orgSettings.groupAdminsCanMoveMembers);
  const manageableGroups = isAdmin
    ? groups
    : groups.filter(g => managedSet.has(g.id) || g.subGroups.some(sg => managedSet.has(sg.id)));

  const selectedMoveGroup = groups.find(g => g.id === moveGroupId);
  const availableSubGroupsForMove = selectedMoveGroup
    ? isAdmin
      ? selectedMoveGroup.subGroups
      : selectedMoveGroup.subGroups.filter(sg => managedSet.has(sg.id))
    : [];

  const canKickTarget =
    !member.isOwner &&
    member.id !== currentUserId &&
    (isAdmin || (isGroupAdmin && orgSettings.groupAdminsCanKick && !member.isAdmin));

  const editableAdminGroups: Array<{ id: number; name: string; parentName?: string; color: string }> = [];
  if (!isFamily) {
    groups.forEach(g => {
      if (isAdmin) {
        editableAdminGroups.push({ id: g.id, name: g.name, color: g.color });
      }
      g.subGroups.forEach(sg => {
        const canSetSub =
          isAdmin ||
          (orgSettings.groupAdminsEnabled &&
            orgSettings.groupAdminsCanManageSubgroupAdmins &&
            directAdminSet.has(g.id));
        if (canSetSub) {
          editableAdminGroups.push({ id: sg.id, name: sg.name, parentName: g.name, color: sg.color });
        }
      });
    });
  }

  const assignments = member.assignments || [];

  const handleAssignToGroup = async () => {
    if (!moveGroupId) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/assign-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetUserId: member.id,
          groupId: moveGroupId,
          subGroupId: moveSubGroupId || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Updated membership', description: `${member.name} was assigned.` });
        setMoveGroupId('');
        setMoveSubGroupId('');
        onUpdated();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to move member', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to move member', variant: 'destructive' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleRemoveFromGroup = async (groupId: number, groupName: string) => {
    setActionBusy(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/remove-from-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId: member.id, groupId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Removed from group', description: `${member.name} was removed from ${groupName}.` });
        onUpdated();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to remove from group', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to remove from group', variant: 'destructive' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleOrgAdmin = async () => {
    setActionBusy(true);
    const action = member.isAdmin ? 'remove' : 'add';
    try {
      const res = await fetch(`/api/organizations/${orgId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId: member.id, action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: action === 'add' ? 'Org admin granted' : 'Org admin removed',
          description: `${member.name} role updated.`,
        });
        onUpdated();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update admin role', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update admin role', variant: 'destructive' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleSpecificGroupAdmin = async (targetGroupId: number) => {
    // Locate current adminIds on group or subgroup
    let currentAdminIds: number[] = [];
    for (const g of groups) {
      if (g.id === targetGroupId) {
        currentAdminIds = g.adminIds || [];
        break;
      }
      const sub = g.subGroups.find(sg => sg.id === targetGroupId);
      if (sub) {
        currentAdminIds = sub.adminIds || [];
        break;
      }
    }
    const exists = currentAdminIds.includes(member.id);
    const nextIds = exists
      ? currentAdminIds.filter(id => id !== member.id)
      : [...currentAdminIds, member.id];

    setActionBusy(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/groups/${targetGroupId}/admins`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userIds: nextIds }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: exists ? 'Group admin removed' : 'Group admin assigned',
          description: `Updated group admin status for ${member.name}.`,
        });
        onUpdated();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update group admin', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update group admin', variant: 'destructive' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleKick = async () => {
    if (!confirm(`Kick ${member.name} from this organization? Their organization plan access will end immediately.`)) {
      return;
    }
    setActionBusy(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/kick-member/${member.id}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Member removed', description: `${member.name} was kicked from the organization.` });
        onUpdated();
        onClose();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to kick member', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to kick member', variant: 'destructive' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleAddNote = async () => {
    const trimmed = newNoteText.trim();
    if (!trimmed) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members/${member.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewNoteText('');
        await loadNotes(member.id);
        toast({ title: 'Note saved', description: `Note added for ${member.name}.` });
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to save note', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save note', variant: 'destructive' });
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveEditNote = async (noteId: number) => {
    const trimmed = editingNoteText.trim();
    if (!trimmed) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/member-notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditingNoteId(null);
        await loadNotes(member.id);
        toast({ title: 'Note updated' });
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update note', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update note', variant: 'destructive' });
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/member-notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
        toast({ title: 'Note deleted' });
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to delete note', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete note', variant: 'destructive' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Profile Header */}
        <div className="p-5 sm:p-6 border-b border-border flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary font-black text-lg flex items-center justify-center flex-shrink-0">
              {member.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-foreground truncate">{member.name}</h3>
                {member.isOwner && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Crown className="w-3 h-3" /> Owner
                  </span>
                )}
                {!member.isOwner && member.isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    <Shield className="w-3 h-3" /> Org Admin
                  </span>
                )}
                {!member.isAdmin && memberAdminGroupIds.size > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    <ShieldCheck className="w-3 h-3" /> Group Admin ({memberAdminGroupIds.size})
                  </span>
                )}
                {!member.isAdmin && memberAdminGroupIds.size === 0 && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                    Member
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {member.email}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Joined {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '—'}
                </span>
                {(orgSettings.showMemberLastActive || isAdmin) && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Last active {member.lastActiveAt ? new Date(member.lastActiveAt).toLocaleString() : 'Never'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Group & Sub-group Memberships + Move Actions */}
          {!isFamily && (
            <div className="space-y-3 p-4 rounded-2xl border border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <FolderInput className="w-3.5 h-3.5 text-primary" />
                  Groups & Sub-groups
                </h4>
                <span className="text-[11px] text-muted-foreground">
                  {assignments.length} assignment{assignments.length === 1 ? '' : 's'}
                </span>
              </div>

              {assignments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  This user is currently unassigned to any group.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignments.map((a, idx) => {
                    const g = groups.find(item => item.id === a.groupId);
                    const sg = a.subGroupId ? g?.subGroups.find(s => s.id === a.subGroupId) : null;
                    if (!g) return null;
                    const canRemove =
                      canMoveMembers &&
                      (isAdmin || managedSet.has(g.id) || (sg ? managedSet.has(sg.id) : false));
                    return (
                      <div
                        key={`${a.groupId}-${a.subGroupId ?? 'direct'}-${idx}`}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-card text-xs"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: sg?.color || g.color }} />
                        <span className="font-semibold text-foreground">{g.name}</span>
                        {sg && (
                          <>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium text-primary">{sg.name}</span>
                          </>
                        )}
                        {canRemove && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => handleRemoveFromGroup(g.id, g.name)}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title={`Remove from ${g.name}`}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canMoveMembers && manageableGroups.length > 0 && (
                <div className="pt-2 border-t border-border/60 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <select
                    value={moveGroupId}
                    onChange={e => {
                      const val = e.target.value ? parseInt(e.target.value, 10) : '';
                      setMoveGroupId(val);
                      setMoveSubGroupId('');
                    }}
                    className="px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground outline-none cursor-pointer"
                  >
                    <option value="">Move / assign to group…</option>
                    {manageableGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>

                  <select
                    value={moveSubGroupId}
                    disabled={!moveGroupId}
                    onChange={e => setMoveSubGroupId(e.target.value ? parseInt(e.target.value, 10) : '')}
                    className="px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground outline-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="">Direct in group (no sub-group)</option>
                    {availableSubGroupsForMove.map(sg => (
                      <option key={sg.id} value={sg.id}>{sg.name}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={!moveGroupId || actionBusy}
                    onClick={handleAssignToGroup}
                    className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-all"
                  >
                    Move / Assign
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Group Admin & Role Actions */}
          {(editableAdminGroups.length > 0 || (isOwner && !member.isOwner) || canKickTarget) && (
            <div className="space-y-3 p-4 rounded-2xl border border-border bg-muted/20">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-primary" />
                Permissions & Actions
              </h4>

              {editableAdminGroups.length > 0 && !member.isOwner && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Group & Sub-group Admin Assignments
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {editableAdminGroups.map(item => {
                      const active = memberAdminGroupIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleToggleSpecificGroupAdmin(item.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                            active
                              ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          {item.parentName ? `${item.parentName} / ${item.name}` : item.name}
                          {active && <Check className="w-3 h-3" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {isOwner && !member.isOwner && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleToggleOrgAdmin}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                      member.isAdmin
                        ? 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    {member.isAdmin ? 'Remove Org Admin' : 'Make Org Admin'}
                  </button>
                )}

                {canKickTarget && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleKick}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Kick from Organization
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Member Notes Section */}
          {canUseNotes && (
            <div className="space-y-3 p-4 rounded-2xl border border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5 text-primary" />
                  Admin Notes ({notes.length})
                </h4>
                <span className="text-[11px] text-muted-foreground">Private to organization admins</span>
              </div>

              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  placeholder={`Leave a private note about ${member.name}…`}
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:border-primary resize-none"
                />
                <button
                  type="button"
                  disabled={!newNoteText.trim() || savingNote}
                  onClick={handleAddNote}
                  className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 self-end inline-flex items-center gap-1.5"
                >
                  {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add Note
                </button>
              </div>

              {notesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : notesError ? (
                <p className="text-xs text-destructive">{notesError}</p>
              ) : notes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No notes yet about this user.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {notes.map(note => (
                    <div key={note.id} className="p-3 rounded-xl border border-border bg-card space-y-1.5">
                      {editingNoteId === note.id ? (
                        <div className="space-y-2">
                          <textarea
                            rows={2}
                            value={editingNoteText}
                            onChange={e => setEditingNoteText(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-primary/40 bg-background text-xs text-foreground outline-none resize-none"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(null)}
                              className="px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground hover:bg-muted"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!editingNoteText.trim() || savingNote}
                              onClick={() => handleSaveEditNote(note.id)}
                              className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-foreground whitespace-pre-wrap">{note.content}</p>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              By <strong className="text-foreground">{note.authorName}</strong> ·{' '}
                              {new Date(note.createdAt).toLocaleString()}
                            </span>
                            {note.canEdit && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNoteId(note.id);
                                    setEditingNoteText(note.content);
                                  }}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                  title="Edit note"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteNote(note.id)}
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  title="Delete note"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

