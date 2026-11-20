import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  CheckSquare,
  Crown,
  Edit3,
  Eye,
  Loader2,
  Mail,
  Plus,
  Search,
  Shield,
  StickyNote,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Task } from '@/types/board';
import { getTaskAssignees } from '@/components/shared/AssignedBadge';
import { toast } from '@/hooks/use-toast';
import { dateLocale } from '@/i18n/format';
import { RolePermissionSelect } from './RolePermissionSelect';

export interface ProjectUsersTabMember {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'member' | 'view' | 'edit' | 'full edit' | 'admin';
}

interface MemberNote {
  id: number;
  content: string;
  authorId: number;
  authorName: string;
  targetUserId: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

interface ProjectUsersTabProps {
  projectId: number;
  projectName: string;
  isOwner: boolean;
  canEdit: boolean;
  currentUserId?: number;
  members: ProjectUsersTabMember[];
  tasks: Task[];
  notes: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onUpdateNote: (noteId: string, updates: Partial<Task>) => void;
  onOpenTask: (taskId: string) => void;
  onOpenNote: (noteId: string) => void;
  onInviteClick: () => void;
  onChangeMemberRole: (memberId: number, role: string) => Promise<void>;
  onRemoveMember: (member: ProjectUsersTabMember) => void;
}

const AVATAR_GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-pink-500 to-rose-500',
  'from-indigo-500 to-blue-600',
];

export const ProjectUsersTab: React.FC<ProjectUsersTabProps> = ({
  projectId,
  projectName,
  isOwner,
  canEdit,
  currentUserId,
  members,
  tasks,
  notes,
  onUpdateTask,
  onUpdateNote,
  onOpenTask,
  onOpenNote,
  onInviteClick,
  onChangeMemberRole,
  onRemoveMember,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'admin' | 'edit' | 'view'>('all');
  const [expandedAssignUserId, setExpandedAssignUserId] = useState<number | null>(null);
  const [expandedNotesUserId, setExpandedNotesUserId] = useState<number | null>(null);
  const [assignPickerTab, setAssignPickerTab] = useState<'tasks' | 'notes'>('tasks');
  const [assignSearch, setAssignSearch] = useState('');

  // Member notes keyed by target user ID
  const [notesByUser, setNotesByUser] = useState<Record<number, MemberNote[]>>({});
  const [notesLoadingId, setNotesLoadingId] = useState<number | null>(null);
  const [newNoteText, setNewNoteText] = useState<Record<number, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
  const [editingNote, setEditingNote] = useState<{ noteId: number; userId: number; text: string } | null>(null);

  const memberStats = useMemo(() => {
    const map = new Map<number, { assignedTasks: Task[]; assignedNotes: Task[]; completedCount: number }>();
    members.forEach(m => map.set(m.id, { assignedTasks: [], assignedNotes: [], completedCount: 0 }));

    tasks.forEach(task => {
      getTaskAssignees(task).forEach(a => {
        const entry = map.get(a.id);
        if (!entry) return;
        entry.assignedTasks.push(task);
        if (task.completed) entry.completedCount += 1;
      });
    });

    notes.forEach(note => {
      getTaskAssignees(note).forEach(a => {
        const entry = map.get(a.id);
        if (!entry) return;
        entry.assignedNotes.push(note);
        if (note.completed) entry.completedCount += 1;
      });
    });
    return map;
  }, [members, tasks, notes]);

  const overview = useMemo(() => {
    const owners = members.filter(m => m.role === 'owner').length;
    const editors = members.filter(m => ['edit', 'full edit', 'admin'].includes(m.role)).length;
    const viewers = members.filter(m => m.role === 'view' || m.role === 'member').length;
    let totalAssigned = 0;
    let totalCompleted = 0;
    memberStats.forEach(v => {
      totalAssigned += v.assignedTasks.length + v.assignedNotes.length;
      totalCompleted += v.completedCount;
    });
    const unassignedTasks = tasks.filter(t => getTaskAssignees(t).length === 0 && !t.completed).length;
    return { owners, editors, viewers, totalAssigned, totalCompleted, unassignedTasks };
  }, [members, memberStats, tasks]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter(m => {
      if (roleFilter === 'edit' && m.role !== 'edit' && m.role !== 'full edit') return false;
      if (roleFilter === 'view' && m.role !== 'view' && m.role !== 'member') return false;
      if ((roleFilter === 'owner' || roleFilter === 'admin') && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
      );
    });
  }, [members, searchQuery, roleFilter]);

  const loadNotesForMember = async (memberId: number) => {
    setNotesLoadingId(memberId);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${memberId}/notes`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotesByUser(prev => ({ ...prev, [memberId]: data.notes || [] }));
      }
    } catch {
      toast({ title: 'Error', description: 'Could not load member notes.', variant: 'destructive' });
    } finally {
      setNotesLoadingId(null);
    }
  };

  useEffect(() => {
    setNotesByUser({});
    setExpandedAssignUserId(null);
    setExpandedNotesUserId(null);
  }, [projectId]);

  const handleToggleNotesPanel = (memberId: number) => {
    if (expandedNotesUserId === memberId) {
      setExpandedNotesUserId(null);
      return;
    }
    setExpandedNotesUserId(memberId);
    void loadNotesForMember(memberId);
  };

  const handleAddNote = async (memberId: number) => {
    const content = (newNoteText[memberId] || '').trim();
    if (!content || savingNoteId === memberId) return;
    setSavingNoteId(memberId);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${memberId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save note');
      setNewNoteText(prev => ({ ...prev, [memberId]: '' }));
      setNotesByUser(prev => ({
        ...prev,
        [memberId]: [data.note, ...(prev[memberId] || [])],
      }));
      toast({ title: 'Note added', description: 'Saved user note cleanly.' });
    } catch (err: any) {
      toast({ title: 'Could not add note', description: err.message, variant: 'destructive' });
    } finally {
      setSavingNoteId(null);
    }
  };

  const handleSaveEditNote = async () => {
    if (!editingNote || !editingNote.text.trim()) return;
    const { noteId, userId, text } = editingNote;
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update note');
      setNotesByUser(prev => ({
        ...prev,
        [userId]: (prev[userId] || []).map(n =>
          n.id === noteId ? { ...n, content: text.trim(), updatedAt: new Date().toISOString() } : n,
        ),
      }));
      setEditingNote(null);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteNote = async (userId: number, noteId: number) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not delete note');
      }
      setNotesByUser(prev => ({
        ...prev,
        [userId]: (prev[userId] || []).filter(n => n.id !== noteId),
      }));
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleItemAssign = (member: ProjectUsersTabMember, item: Task, kind: 'task' | 'note') => {
    const current = getTaskAssignees(item);
    const exists = current.some(a => a.id === member.id);
    const next = exists
      ? current.filter(a => a.id !== member.id)
      : [...current, { id: member.id, name: member.name }];
    const primary = next[0] || null;
    const updates: Partial<Task> = {
      assignedToUsers: next,
      assignedToUserIds: next.map(m => m.id),
      assignedToUserId: primary ? primary.id : null,
      assignedToUserName: primary ? primary.name : null,
    };
    if (kind === 'task') onUpdateTask(item.id, updates);
    else onUpdateNote(item.id, updates);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Visuals & Team Insights Header */}
      <div className="rounded-3xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary mb-1">
              <Users className="w-3.5 h-3.5" />
              Team Roster & Workload
            </div>
            <h2 className="text-lg font-black text-foreground">
              {projectName} Members ({members.length})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Assign tasks or notes directly to members, manage roles, and keep shared notes per teammate.
            </p>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={onInviteClick}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 hover:scale-[1.01] active:scale-95 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              Invite User
            </button>
          )}
        </div>

        {/* Visual Metric Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-border/80 bg-background/80 p-3.5 transition-all hover:border-primary/30">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span>Total Team</span>
              <Users className="w-3.5 h-3.5 text-primary" />
            </div>
            <p className="text-2xl font-black text-foreground mt-1">{members.length}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {overview.owners} owner · {overview.editors} editor{overview.editors === 1 ? '' : 's'} · {overview.viewers} viewer{overview.viewers === 1 ? '' : 's'}
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/80 p-3.5 transition-all hover:border-primary/30">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span>Assigned Assignments</span>
              <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <p className="text-2xl font-black text-foreground mt-1">{overview.totalAssigned}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {overview.totalCompleted} completed across team
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/80 p-3.5 transition-all hover:border-primary/30">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span>Unassigned Open Tasks</span>
              <Edit3 className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-2xl font-black text-foreground mt-1">{overview.unassignedTasks}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {overview.unassignedTasks === 0 ? 'All active tasks owned' : 'Ready to assign below'}
            </p>
          </div>

          {/* Workload Balance Mini Visualizer */}
          <div className="rounded-2xl border border-border/80 bg-background/80 p-3.5 col-span-2 lg:col-span-1">
            <span className="text-[11px] font-semibold text-muted-foreground block mb-2">
              Team Load Balance
            </span>
            <div className="space-y-1.5">
              {members.slice(0, 3).map(m => {
                const st = memberStats.get(m.id);
                const count = (st?.assignedTasks.length || 0) + (st?.assignedNotes.length || 0);
                const pct = overview.totalAssigned > 0 ? Math.min(100, Math.round((count / overview.totalAssigned) * 100)) : 0;
                return (
                  <div key={m.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-foreground truncate max-w-[110px]">{m.name}</span>
                      <span className="text-muted-foreground">{count} item{count === 1 ? '' : 's'}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.max(pct, count > 0 ? 12 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {members.length === 0 && (
                <span className="text-[11px] text-muted-foreground">No members yet.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search team members by name, email, or role…"
            className="w-full bg-card border border-border rounded-2xl pl-9 pr-3.5 py-2 text-xs text-foreground outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            { id: 'all', label: `All (${members.length})` },
            { id: 'owner', label: 'Owner' },
            { id: 'admin', label: 'Admin' },
            { id: 'edit', label: 'Editors' },
            { id: 'view', label: 'Viewers' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRoleFilter(opt.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                roleFilter === opt.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List View of Users */}
      <div className="space-y-3">
        {filteredMembers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center space-y-2">
            <Users className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-bold text-foreground">No members match your filter</p>
            <p className="text-xs text-muted-foreground">Try clearing search or changing the role filter.</p>
          </div>
        ) : (
          filteredMembers.map((member, index) => {
            const st = memberStats.get(member.id) || { assignedTasks: [], assignedNotes: [], completedCount: 0 };
            const totalAssigned = st.assignedTasks.length + st.assignedNotes.length;
            const completionPct = totalAssigned > 0 ? Math.round((st.completedCount / totalAssigned) * 100) : 0;
            const gradient = AVATAR_GRADIENTS[(member.id + index) % AVATAR_GRADIENTS.length];
            const isAssignOpen = expandedAssignUserId === member.id;
            const isNotesOpen = expandedNotesUserId === member.id;
            const memberNotes = notesByUser[member.id] || [];
            const isSelf = member.id === currentUserId;

            const assignableSource = assignPickerTab === 'tasks' ? tasks : notes;
            const filteredAssignable = assignableSource.filter(item =>
              !assignSearch.trim() || item.title.toLowerCase().includes(assignSearch.trim().toLowerCase()),
            );

            return (
              <div
                key={member.id}
                className="rounded-2xl border border-border bg-card shadow-xs hover:border-primary/30 transition-all overflow-hidden"
              >
                {/* List Row Main Strip */}
                <div className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Identity & Role */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div
                      className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} text-white font-black text-base flex items-center justify-center shadow-sm flex-shrink-0`}
                    >
                      {member.name.trim().slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground truncate">{member.name}</span>
                        {isSelf && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            You
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            member.role === 'owner'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : ['edit', 'full edit', 'admin'].includes(member.role)
                                ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : 'border-border bg-muted text-muted-foreground'
                          }`}
                        >
                          {member.role === 'owner' ? (
                            <Crown className="w-2.5 h-2.5" />
                          ) : ['edit', 'full edit', 'admin'].includes(member.role) ? (
                            <Shield className="w-2.5 h-2.5" />
                          ) : (
                            <Eye className="w-2.5 h-2.5" />
                          )}
                          {member.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3" /> {member.email}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Per-user Visual Progress */}
                  <div className="flex items-center gap-4 lg:w-56 flex-shrink-0">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-foreground">
                          {st.assignedTasks.length} tasks · {st.assignedNotes.length} notes
                        </span>
                        <span className="font-bold text-primary">{completionPct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                          style={{ width: `${completionPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedAssignUserId(isAssignOpen ? null : member.id);
                          setAssignSearch('');
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                          isAssignOpen
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-background hover:bg-muted text-foreground'
                        }`}
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        Assign Items ({totalAssigned})
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleToggleNotesPanel(member.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                        isNotesOpen
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'border-border bg-background hover:bg-muted text-foreground'
                      }`}
                    >
                      <StickyNote className="w-3.5 h-3.5" />
                      User Notes
                      {notesByUser[member.id]?.length ? ` (${notesByUser[member.id].length})` : ''}
                    </button>

                    {isOwner && member.role !== 'owner' && (
                      <div className="flex items-center gap-1.5">
                        <RolePermissionSelect
                          size="sm"
                          ariaLabel={`Change role for ${member.name}`}
                          value={member.role}
                          onChange={nextRole => { void onChangeMemberRole(member.id, nextRole); }}
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveMember(member)}
                          title={`Remove ${member.name} from project`}
                          className="p-2 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Assigned Pills Preview (compact strip when collapsed & user has assignments) */}
                {!isAssignOpen && totalAssigned > 0 && (
                  <div className="px-4 sm:px-5 pb-3 pt-0 flex flex-wrap items-center gap-1.5">
                    {st.assignedTasks.slice(0, 5).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpenTask(t.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                          t.completed
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 line-through'
                            : 'border-border bg-muted/40 text-foreground hover:border-primary/40'
                        }`}
                      >
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span className="truncate max-w-[140px]">{t.title}</span>
                      </button>
                    ))}
                    {st.assignedNotes.slice(0, 4).map(n => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => onOpenNote(n.id)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:border-amber-500/50 transition-colors"
                      >
                        <StickyNote className="w-2.5 h-2.5" />
                        <span className="truncate max-w-[140px]">{n.title || 'Untitled note'}</span>
                      </button>
                    ))}
                    {totalAssigned > 9 && (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        +{totalAssigned - 9} more
                      </span>
                    )}
                  </div>
                )}

                {/* Expandable Assign Tasks / Notes Picker */}
                {isAssignOpen && canEdit && (
                  <div className="border-t border-border bg-muted/20 p-4 space-y-3 animate-fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-card border border-border">
                        <button
                          type="button"
                          onClick={() => setAssignPickerTab('tasks')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            assignPickerTab === 'tasks' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          Tasks ({tasks.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssignPickerTab('notes')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            assignPickerTab === 'notes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          Notes ({notes.length})
                        </button>
                      </div>

                      <div className="flex items-center gap-2 flex-1 max-w-xs">
                        <input
                          type="text"
                          value={assignSearch}
                          onChange={e => setAssignSearch(e.target.value)}
                          placeholder={`Filter ${assignPickerTab}…`}
                          className="w-full bg-background border border-border rounded-xl px-3 py-1.5 text-xs outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedAssignUserId(null)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {filteredAssignable.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">
                        No {assignPickerTab} available in this project yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                        {filteredAssignable.map(item => {
                          const assigned = getTaskAssignees(item).some(a => a.id === member.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleToggleItemAssign(member, item, assignPickerTab === 'tasks' ? 'task' : 'note')}
                              className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition-all ${
                                assigned
                                  ? 'border-primary bg-primary/15 text-foreground shadow-xs'
                                  : 'border-border bg-card hover:bg-muted/60 text-foreground'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className={`text-xs font-semibold truncate ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                                  {item.title || 'Untitled'}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {item.completed ? 'Completed' : item.dueDate ? `Due ${item.dueDate}` : 'Active'}
                                </p>
                              </div>
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  assigned ? 'bg-primary text-primary-foreground' : 'border border-border bg-background text-transparent'
                                }`}
                              >
                                <Check className="w-3 h-3" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Expandable Notes on User Panel */}
                {isNotesOpen && (
                  <div className="border-t border-border bg-amber-500/5 p-4 space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                        Notes on {member.name}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setExpandedNotesUserId(null)}
                        className="p-1 rounded-lg text-muted-foreground hover:bg-muted"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {canEdit && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newNoteText[member.id] || ''}
                          onChange={e => setNewNoteText(prev => ({ ...prev, [member.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && void handleAddNote(member.id)}
                          placeholder={`Add a note about ${member.name} (skills, focus area, reminders)…`}
                          className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          disabled={!(newNoteText[member.id] || '').trim() || savingNoteId === member.id}
                          onClick={() => void handleAddNote(member.id)}
                          className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
                        >
                          {savingNoteId === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          Add Note
                        </button>
                      </div>
                    )}

                    {notesLoadingId === member.id ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading notes…
                      </div>
                    ) : memberNotes.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No notes recorded on {member.name} yet.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {memberNotes.map(n => (
                          <div
                            key={n.id}
                            className="rounded-xl border border-border bg-card p-3 flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              {editingNote && editingNote.noteId === n.id ? (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingNote.text}
                                    onChange={e => setEditingNote({ ...editingNote, text: e.target.value })}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') void handleSaveEditNote();
                                      if (e.key === 'Escape') setEditingNote(null);
                                    }}
                                    className="flex-1 bg-background border border-primary/40 rounded-lg px-2.5 py-1 text-xs outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveEditNote()}
                                    className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs text-foreground whitespace-pre-wrap break-words">{n.content}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground">
                                By <strong className="text-foreground/80">{n.authorName}</strong> ·{' '}
                                {new Date(n.createdAt).toLocaleString(dateLocale(), {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {n.canEdit && editingNote?.noteId !== n.id && (
                                <button
                                  type="button"
                                  onClick={() => setEditingNote({ noteId: n.id, userId: member.id, text: n.content })}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted"
                                  title="Edit note"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {n.canDelete && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteNote(member.id, n.id)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  title="Delete note"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ProjectUsersTab;
